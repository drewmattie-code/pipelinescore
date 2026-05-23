import Anthropic from '@anthropic-ai/sdk';
import type { Task } from '../types.js';

const JUDGE_MODEL = 'claude-haiku-4-5-20251001';

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

/**
 * judge_type: rubric
 * Send (prompt, response, rubric items) to Claude Haiku 4.5 and ask for a 0-10 score.
 *
 * If no ANTHROPIC_API_KEY is available, the task is skipped (returns null) and the
 * scorer omits it from the category mean — per spec, the run still completes.
 */
export async function judgeRubric(
  task: Task,
  response: string,
): Promise<{ score: number; rationale: string } | null> {
  const judge = getJudge();
  if (!judge) return null;

  const rubric = task.rubric ?? [];
  const judgePrompt =
    `You are an impartial grader for an LLM benchmark. Read the task, the rubric, and the model's response. ` +
    `Return ONLY a JSON object: {"score": <0-10 integer>, "passed_items": [<index>...], "rationale": "<one sentence>"}.\n\n` +
    `Score 10 if every rubric item is satisfied. Subtract proportionally for missed items. Score 0 if response is empty, ` +
    `off-topic, or violates explicit constraints (e.g. "no commentary" when commentary is present).\n\n` +
    `TASK:\n${task.prompt}\n\nRUBRIC:\n${rubric.map((r, i) => `${i}. ${r}`).join('\n')}\n\nMODEL RESPONSE:\n${response}\n\nJSON:`;

  try {
    const res = await judge.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 400,
      temperature: 0,
      messages: [{ role: 'user', content: judgePrompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    // strip ```json if present
    const cleaned = text.replace(/```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { score: number; rationale?: string };
    const clamped = Math.max(0, Math.min(10, Number(parsed.score)));
    return {
      score: clamped,
      rationale: parsed.rationale ?? '',
    };
  } catch (e) {
    return {
      score: 0,
      rationale: `judge error: ${(e as Error).message.slice(0, 120)}`,
    };
  }
}

export function judgeAvailable(): boolean {
  return getJudge() !== null;
}
