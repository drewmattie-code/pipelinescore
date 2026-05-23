import type { Task } from '../types.js';
import { runPython, stripCodeFences } from './python.js';

/**
 * judge_type: execute_python_snippet
 * Fill {RESPONSE} in task.wrapper with the model's response, then run the script
 * and check that the string repr of `result` matches task.expected.
 */
export async function judgeExecutePythonSnippet(
  task: Task,
  response: string,
): Promise<{ score: number; rationale: string }> {
  const wrapper = task.wrapper ?? '';
  const expected = String(task.expected ?? '');
  if (!wrapper) return { score: 0, rationale: 'no wrapper defined' };

  let snippet = stripCodeFences(response).trim();
  // The wrapper expects a single line replacing {RESPONSE} inside an existing function.
  // If the model returned multi-line, take the first non-empty line containing 'return'
  // (the prompt asks for the corrected return line).
  if (snippet.includes('\n')) {
    const lines = snippet.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const returnLine = lines.find((l) => l.startsWith('return ')) ?? lines[0];
    snippet = returnLine;
  }

  const script = wrapper.replace('{RESPONSE}', snippet) + '\nprint(repr(result))\n';
  const result = await runPython(script);
  if (result.exitCode !== 0 && !result.stdout) {
    return { score: 0, rationale: `python error: ${result.stderr.slice(0, 200)}` };
  }
  const got = result.stdout.trim();
  const ok = got === expected;
  return {
    score: ok ? 10 : 0,
    rationale: `got ${got || '(empty)'}, want ${expected}`,
  };
}
