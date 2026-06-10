// Server-side rubric judge. Grades the subjective (rubric) tasks centrally so
// users do NOT need their own Anthropic key — they run any model on any
// hardware, submit the outputs, and the lab's judge (the backend's
// ANTHROPIC_API_KEY) grades the rubric slice consistently for everyone.
//
// Uses a direct fetch to the Anthropic Messages API (no SDK dependency).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export interface RubricTask {
  prompt: string;
  rubric: string[];
}

export function judgeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function buildPrompt(task: RubricTask, output: string): string {
  const rubric = task.rubric ?? [];
  return (
    `You are an impartial grader for an LLM benchmark. Read the task, the rubric, and the model's response. ` +
    `Return ONLY a JSON object: {"score": <0-10 integer>, "rationale": "<one sentence>"}.\n\n` +
    `Score 10 if every rubric item is satisfied. Subtract proportionally for missed items. Score 0 if the response is empty, ` +
    `off-topic, or violates explicit constraints.\n\n` +
    `TASK:\n${task.prompt}\n\nRUBRIC:\n${rubric.map((r, i) => `${i}. ${r}`).join('\n')}\n\nMODEL RESPONSE:\n${output}\n\nJSON:`
  );
}

async function gradeOnce(model: string, prompt: string, temperature: number, key: string): Promise<{ score: number; rationale: string } | null> {
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 400, temperature, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    const cleaned = text.replace(/```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { score: number; rationale?: string };
    return { score: Math.max(0, Math.min(10, Number(parsed.score))), rationale: parsed.rationale ?? '' };
  } catch {
    return null;
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

export async function gradeRubric(task: RubricTask, output: string): Promise<{ score: number; stddev: number; rationale: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.PS_JUDGE_MODEL ?? 'claude-haiku-4-5-20251001';
  const samples = Math.max(1, Number(process.env.PS_JUDGE_SAMPLES ?? 2)); // fewer than the CLI to bound submit cost/latency
  const temperature = Number(process.env.PS_JUDGE_TEMPERATURE ?? 0.4);
  const prompt = buildPrompt(task, output);

  const scores: number[] = [];
  let firstRationale = '';
  for (let i = 0; i < samples; i++) {
    const r = await gradeOnce(model, prompt, temperature, key);
    if (r) {
      scores.push(r.score);
      if (!firstRationale && r.rationale) firstRationale = r.rationale;
    }
  }
  if (scores.length === 0) return null;
  return { score: median(scores), stddev: std(scores), rationale: `server-graded, median of ${scores.length}: ${firstRationale}` };
}
