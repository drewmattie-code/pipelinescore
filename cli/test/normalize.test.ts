/**
 * Run with: npm test
 *
 * A model's reasoning is not its answer. Servers disagree about whether to hand
 * it to you: LM Studio strips gpt-oss harmony channels, MLX returns them raw.
 * Judging the raw text made the same model score 93.2 on one server and 41.5 on
 * another, which breaks the entire premise that hardware is the only variable.
 */
import { stripReasoning } from '../src/normalize.js';

let failures = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  if (!ok) failures += 1;
}

// ---- the untouched majority ------------------------------------------------
// Anything without reasoning markers must come back byte-identical. Most models
// and most tasks go through here, so a regression would be catastrophic.
eq('plain text is verbatim', stripReasoning('Final: 42'), 'Final: 42');
eq('preserves leading/trailing whitespace when nothing matched',
  stripReasoning('  Final: 42\n'), '  Final: 42\n');
eq('json passes through', stripReasoning('{"ok": true}'), '{"ok": true}');
eq('code fence passes through',
  stripReasoning('```python\ndef f():\n    return 1\n```'),
  '```python\ndef f():\n    return 1\n```');
eq('the word "final" in prose is not a marker',
  stripReasoning('The final answer is 7.'), 'The final answer is 7.');
eq('empty stays empty', stripReasoning(''), '');

// ---- harmony (gpt-oss) -----------------------------------------------------
eq('harmony: keeps only the final channel',
  stripReasoning('<|channel|>analysis<|message|>The user wants JSON. Think think.<|end|><|start|>assistant<|channel|>final<|message|>{"ok": true}'),
  '{"ok": true}');
eq('harmony: strips a trailing <|end|>',
  stripReasoning('<|channel|>analysis<|message|>hmm<|end|><|start|>assistant<|channel|>final<|message|>Final: 42<|end|>'),
  'Final: 42');
eq('harmony: strips a trailing <|return|>',
  stripReasoning('<|channel|>final<|message|>Final: 42<|return|>'),
  'Final: 42');
eq('harmony: tolerates the malformed variant missing a closing angle bracket',
  stripReasoning('<|channel|analysis<|message|thinking<|end|><|channel|final<|message|Final: 9'),
  'Final: 9');
eq('harmony: takes the LAST final channel when several appear',
  stripReasoning('<|channel|>final<|message|>first<|end|><|channel|>final<|message|>second'),
  'second');
eq('harmony: python survives the strip',
  stripReasoning('<|channel|>analysis<|message|>plan<|end|><|start|>assistant<|channel|>final<|message|>def f():\n    return 1'),
  'def f():\n    return 1');

// analysis with no final channel = the model never produced an answer. Returning
// the reasoning would let it score by accident; an empty answer fails honestly.
eq('harmony: analysis with no final channel yields nothing',
  stripReasoning('<|channel|>analysis<|message|>I am still thinking and ran out of budget'),
  '');

// ---- <think> style (DeepSeek R1, Qwen3 thinking) ---------------------------
eq('think: block removed',
  stripReasoning('<think>Let me work through this.</think>Final: 42'), 'Final: 42');
eq('think: multiline block removed',
  stripReasoning('<think>\nstep one\nstep two\n</think>\n{"a": 1}'), '{"a": 1}');
eq('thinking: long-form tag removed',
  stripReasoning('<thinking>hmm</thinking>Final: 7'), 'Final: 7');
eq('reasoning: tag removed',
  stripReasoning('<reasoning>hmm</reasoning>Final: 7'), 'Final: 7');
eq('think: orphan closing tag keeps what follows it',
  stripReasoning('I should count them.</think>Final: 3'), 'Final: 3');
eq('think: unclosed block yields nothing',
  stripReasoning('<think>still going when the token budget ran out'), '');
eq('think: several blocks all removed',
  stripReasoning('<think>a</think>mid<think>b</think>end'), 'midend');

// ---- combined --------------------------------------------------------------
eq('harmony wrapping a think block',
  stripReasoning('<|channel|>analysis<|message|>x<|end|><|start|>assistant<|channel|>final<|message|><think>y</think>Final: 5'),
  'Final: 5');

console.log(failures === 0 ? '\nnormalize: all passed' : `\nnormalize: ${failures} FAILED`);
if (failures > 0) process.exit(1);
