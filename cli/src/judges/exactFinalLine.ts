import type { Task } from '../types.js';

/**
 * judge_type: exact_final_line
 * Pull the last non-empty line of the response. If task.expected_pattern looks like
 * a regex (wrapped /.../) treat it as one; otherwise do a case-insensitive contains-match.
 */
export function judgeExactFinalLine(task: Task, response: string): { score: number; rationale: string } {
  const pattern = task.expected_pattern ?? '';
  if (!pattern) return { score: 0, rationale: 'no expected_pattern' };

  const lines = response
    .split('\n')
    .map((l) => l.replace(/[*`_>#-]+/g, '').trim())
    .filter((l) => l.length > 0);
  const last = lines[lines.length - 1] ?? '';

  let ok = false;
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    const re = new RegExp(pattern.slice(1, -1), 'i');
    ok = re.test(last);
  } else {
    ok = last.toLowerCase().includes(pattern.toLowerCase());
  }
  return {
    score: ok ? 10 : 0,
    rationale: `last line "${last.slice(0, 80)}" ${ok ? 'matched' : 'did not match'} "${pattern}"`,
  };
}
