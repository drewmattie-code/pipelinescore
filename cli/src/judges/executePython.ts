import type { Task } from '../types.js';
import { runPython, stripCodeFences } from './python.js';

/**
 * judge_type: execute_python
 * The model returns a Python function body. We compose:
 *   <response>
 *   import sys, json
 *   print(json.dumps([repr(<input>) for each test_case]))
 * and compare each output's repr to test_case.expected.
 *
 * All-or-nothing: 10 if every test case passes, 0 otherwise.
 */
export async function judgeExecutePython(task: Task, response: string): Promise<{ score: number; rationale: string }> {
  const code = stripCodeFences(response);
  const cases = task.test_cases ?? [];
  if (cases.length === 0) return { score: 0, rationale: 'no test cases defined' };

  // Build a probe script: define the function, then eval each expression, print repr(result).
  const probes = cases
    .map((c, i) => `try:\n    _r${i} = ${c.input}\n    print("RESULT_${i}=" + repr(_r${i}))\nexcept Exception as e:\n    print("RESULT_${i}=ERROR:" + type(e).__name__)`)
    .join('\n');

  const script = `${code}\n\n${probes}\n`;
  const result = await runPython(script);
  if (result.exitCode !== 0 && !result.stdout) {
    return { score: 0, rationale: `python error: ${result.stderr.slice(0, 200)}` };
  }

  let allPass = true;
  const details: string[] = [];
  for (let i = 0; i < cases.length; i++) {
    const expected = cases[i].expected;
    const re = new RegExp(`RESULT_${i}=(.*)`);
    const match = result.stdout.match(re);
    const got = match ? match[1].trim() : '';
    // expected is something like "55" or "0" — compare as a literal
    // got is repr-formatted: e.g. "55" or "'hello'"
    const ok = got === expected || got === `'${expected}'`;
    if (!ok) allPass = false;
    details.push(`${cases[i].input} → got ${got}, want ${expected} ${ok ? 'OK' : 'FAIL'}`);
  }
  return {
    score: allPass ? 10 : 0,
    rationale: details.join(' | '),
  };
}
