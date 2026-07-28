/**
 * Separating a model's reasoning from its answer.
 *
 * Reasoning models emit their scratchpad and their answer in one response, and
 * local servers disagree about what to do with it. LM Studio strips gpt-oss
 * harmony channels and returns just the answer; MLX hands back the whole thing.
 * Judging the raw text gave the same model 93.2 on one server and 41.5 on
 * another — the code judge was feeding the scratchpad to python3 and the JSON
 * judge was parsing prose. That makes the inference server the dominant
 * variable in a benchmark whose whole claim is that the hardware is.
 *
 * Two families are handled:
 *   harmony (gpt-oss)  <|channel|>analysis<|message|>…<|end|>
 *                      <|start|>assistant<|channel|>final<|message|>ANSWER
 *   tagged   (R1, Qwen3 thinking)  <think>…</think>ANSWER
 *
 * Guarantee: a response containing none of these markers is returned byte for
 * byte. Most models and most tasks take that path, so it must not be disturbed.
 */

/** Matches a harmony channel header, tolerating servers that drop the closing `>`. */
const HARMONY_CHANNEL = (name: string) =>
  new RegExp(`<\\|channel\\|>?\\s*${name}\\s*<\\|message\\|>?`, 'gi');

/** Harmony control tokens that can trail the answer once the header is gone. */
const HARMONY_CONTROL = /<\|(?:end|return|start|endoftext|call|constrain)\|>?/gi;

const REASONING_TAGS = 'think|thinking|reasoning';
const TAG_BLOCK = new RegExp(`<(${REASONING_TAGS})>[\\s\\S]*?<\\/\\1>`, 'gi');
const TAG_CLOSE = new RegExp(`<\\/(?:${REASONING_TAGS})>`, 'gi');
const TAG_OPEN = new RegExp(`<(?:${REASONING_TAGS})>`, 'i');

/** Index just past the last match, or -1 if there were none. */
function endOfLastMatch(text: string, pattern: RegExp): number {
  let end = -1;
  let m: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text)) !== null) {
    end = m.index + m[0].length;
    if (m[0].length === 0) pattern.lastIndex += 1; // guard against zero-width loops
  }
  return end;
}

/**
 * Return only the model's answer, with any reasoning removed.
 *
 * A model that produced reasoning but never reached an answer returns '' rather
 * than its scratchpad: an empty answer fails honestly, whereas scratchpad text
 * can match a judge by accident and inflate the score.
 */
export function stripReasoning(text: string): string {
  if (!text) return text;

  const hasHarmony = HARMONY_CHANNEL('[a-z_]+').test(text);
  const hasTagBlock = TAG_BLOCK.test(text);
  const hasTagClose = TAG_CLOSE.test(text);
  const hasTagOpen = TAG_OPEN.test(text);
  // Nothing to do — hand back exactly what came in.
  if (!hasHarmony && !hasTagBlock && !hasTagClose && !hasTagOpen) return text;

  let out = text;

  if (hasHarmony) {
    const finalStart = endOfLastMatch(out, HARMONY_CHANNEL('final'));
    if (finalStart >= 0) {
      out = out.slice(finalStart);
    } else {
      // Channels present but none of them final: no answer was ever emitted.
      return '';
    }
    out = out.replace(HARMONY_CONTROL, '');
  }

  // Complete <think>…</think> pairs are reasoning; drop them wherever they sit.
  out = out.replace(TAG_BLOCK, '');

  // An orphan </think> means everything before it was reasoning.
  const afterClose = endOfLastMatch(out, TAG_CLOSE);
  if (afterClose >= 0) out = out.slice(afterClose);

  // An orphan <think> means the model was still reasoning when it stopped.
  if (TAG_OPEN.test(out)) return '';

  return out.trim();
}
