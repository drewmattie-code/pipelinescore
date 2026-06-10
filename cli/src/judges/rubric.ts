import Anthropic from '@anthropic-ai/sdk';
import type { Task } from '../types.js';

const DEFAULT_JUDGE_MODEL = 'claude-haiku-4-5-20251001';

export interface JudgeConfig {
  model: string; // comma-separated list = ensemble
  samples: number; // self-consistency samples per model
  temperature: number;
}

let cachedJudge: Anthropic | null | undefined;

function getJudge(): Anthropic | null {
  if (cachedJudge !== undefined) return cachedJudge;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    cachedJudge = null;
    return null;
  }
  cachedJudge = new Anthropic({ apiKey: key });
  return cachedJudge;
}

function resolveConfig(config?: Partial<JudgeConfig>): JudgeConfig {
  return {
    model: process.env.PS_JUDGE_MODEL ?? config?.model ?? DEFAULT_JUDGE_MODEL,
    samples: Number(process.env.PS_JUDGE_SAMPLES ?? config?.samples ?? 3),
    temperature: Number(process.env.PS_JUDGE_TEMPERATURE ?? config?.temperature ?? 0.4),
  };
}

function buildPrompt(task: Task, response: string): string {
  const rubric = task.rubric ?? [];
  return (
    `You are an impartial grader for an LLM benchmark. Read the task, the rubric, and the model's response. ` +
    `Return ONLY a JSON object: {"score": <0-10 integer>, "passed_items": [<index>...], "rationale": "<one sentence>"}.\n\n` +
    `Score 10 if every rubric item is satisfied. Subtract proportionally for missed items. Score 0 if response is empty, ` +
    `off-topic, or violates explicit constraints (e.g. "no commentary" when commentary is present).\n\n` +
    `TASK:\n${task.prompt}\n\nRUBRIC:\n${rubric.map((r, i) => `${i}. ${r}`).join('\n')}\n\nMODEL RESPONSE:\n${response}\n\nJSON:`
  );
}

async function gradeOnce(
  judge: Anthropic,
  model: string,
  prompt: string,
  temperature: number,
): Promise<{ score: number; rationale: string } | null> {
  try {
    const res = await judge.messages.create({
      model,
      max_tokens: 400,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
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

/**
 * judge_type: rubric — v2 self-consistency + optional ensemble.
 *
 * Grades the task `samples` times per judge model (judge temperature > 0 so the
 * samples vary), pools all sample scores, and returns the MEDIAN as the task
 * score plus the sample STD as the within-task spread (fed into the category
 * confidence band). Multiple comma-separated models form an ensemble.
 *
 * Returns null only when no judge is available (no ANTHROPIC_API_KEY), so the
 * scorer drops the task and the run still completes.
 */
export async function judgeRubric(
  task: Task,
  response: string,
  config?: Partial<JudgeConfig>,
): Promise<{ score: number; rationale: string; stddev: number } | null> {
  const judge = getJudge();
  if (!judge) return null;

  const cfg = resolveConfig(config);
  const models = cfg.model.split(',').map((m) => m.trim()).filter(Boolean);
  const prompt = buildPrompt(task, response);

  const scores: number[] = [];
  let firstRationale = '';
  for (const model of models) {
    for (let i = 0; i < Math.max(1, cfg.samples); i++) {
      const r = await gradeOnce(judge, model, prompt, cfg.temperature);
      if (r) {
        scores.push(r.score);
        if (!firstRationale && r.rationale) firstRationale = r.rationale;
      }
    }
  }

  if (scores.length === 0) {
    return { score: 0, rationale: 'judge error: no successful samples', stddev: 0 };
  }
  const score = median(scores);
  const spread = std(scores);
  return {
    score,
    stddev: spread,
    rationale: `median of ${scores.length} judge sample(s), spread ±${spread.toFixed(1)}: ${firstRationale}`,
  };
}

export function judgeAvailable(): boolean {
  return getJudge() !== null;
}
