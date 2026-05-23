import type { Task } from '../types.js';

function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  // strip ```json fences
  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Try to find a {...} or [...] inside the string
    const obj = candidate.match(/\{[\s\S]*\}/);
    if (obj) {
      try { return JSON.parse(obj[0]); } catch { /* fallthrough */ }
    }
    const arr = candidate.match(/\[[\s\S]*\]/);
    if (arr) {
      try { return JSON.parse(arr[0]); } catch { /* fallthrough */ }
    }
    return null;
  }
}

function deepEqual(a: unknown, b: unknown, ordered = false): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i], ordered));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    if (ordered && ak.join(',') !== bk.join(',')) return false;
    return ak.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], ordered),
    );
  }
  return false;
}

/**
 * judge_type: json_match
 * Parse the response as JSON. Deep-equal against task.expected.
 * If task.ordered, also require key order to match.
 */
export function judgeJsonMatch(task: Task, response: string): { score: number; rationale: string } {
  const parsed = extractJson(response);
  if (parsed === null) return { score: 0, rationale: 'response was not valid JSON' };
  const ordered = task.ordered ?? false;
  const ok = deepEqual(parsed, task.expected, ordered);
  return {
    score: ok ? 10 : 0,
    rationale: ok
      ? 'json matched'
      : `parsed ${JSON.stringify(parsed).slice(0, 120)} vs expected ${JSON.stringify(task.expected).slice(0, 120)}`,
  };
}
