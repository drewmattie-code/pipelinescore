// Routing profile export: merging, refusals, and shape.
// Run: npx tsx test/v4-profile.test.ts
import { buildProfile, PROFILE_FORMAT } from '../src/v4/profile.js';
import type { Suite, V4Summary, V4TaskResult } from '../src/v4/types.js';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const suiteScores = (m: number) => {
  const out = {} as V4Summary['suite_scores'];
  for (const s of ['code', 'repo', 'agent', 'fncall', 'reason', 'longdoc', 'instruct'] as Suite[]) out[s] = { mean: m, ci_low: m - 10, ci_high: m + 10, n: 2 };
  return out;
};
const task = (id: string, suite: Suite, score: number): V4TaskResult =>
  ({ task_id: id, suite, score, detail: '', response: '', turns: 1, latency_ms: 1000, tokens_in: 1, tokens_out: 50 });
const run = (model: string, hw: string, score: number, seed: string, extra: Partial<V4Summary> = {}): V4Summary => ({
  testpack_version: '4.0.0-test', seed, model, provider: hw === 'cloud' ? 'minimax' : 'local', hardware_tag: hw, cli_version: 't',
  pipeline_score: score, suite_scores: suiteScores(score), speed: { tps_p50: 40, total_tokens_out: 100, wall_s: 2 },
  task_results: [task('code-a', 'code', score / 100), task('agent-a', 'agent', score / 100)],
  started_at: '', finished_at: '', ...extra,
});

const p = buildProfile([run('small', 'm5-max-48gb', 60, 'a'), run('small', 'm5-max-48gb', 80, 'b'), run('big', 'cloud', 90, 'c')], { now: new Date(0) });
check('format tag', p.format === PROFILE_FORMAT);
check('same model + hardware merge into one entry', p.models.length === 2, String(p.models.length));
const small = p.models.find((m) => m.id === 'small')!;
check('merged pipeline score is the mean', small.pipeline_score === 70, String(small.pipeline_score));
check('merged per-task score is the mean', small.tasks.find((t) => t.task_id === 'code-a')!.score === 0.7);
check('merged band spans both runs', small.suites.code.ci_low === 50 && small.suites.code.ci_high === 90, JSON.stringify(small.suites.code));
check('runs and seeds recorded', small.runs === 2 && small.seeds.join() === 'a,b');
check('cloud vs local location', p.models.find((m) => m.id === 'big')!.location === 'cloud' && small.location === 'local');
check('sorted best first', p.models[0].id === 'big');
check('suite examples for every suite', Object.keys(p.suite_examples).length === 7 && Object.values(p.suite_examples).every((xs) => xs.length > 0));
check('examples are bounded in length', Object.values(p.suite_examples).flat().every((x) => x.length <= 1200));

const sameModelOtherHw = buildProfile([run('small', 'm5-max-48gb', 60, 'a'), run('small', 'rtx-3080-10gb', 50, 'b')]);
check('same model on different hardware stays separate', sameModelOtherHw.models.length === 2);

let threw = '';
try { buildProfile([run('x', 'cloud', 50, 'a', { aborted: 'server died' })]); } catch (e) { threw = (e as Error).message; }
check('aborted runs are refused', threw.includes('aborted'), threw);
threw = '';
try { buildProfile([run('x', 'cloud', 50, 'a'), run('y', 'cloud', 50, 'b', { testpack_version: '4.0.0-other' })]); } catch (e) { threw = (e as Error).message; }
check('mixed testpack versions are refused', threw.includes('different testpack'), threw);

threw = '';
try { buildProfile([run('x', 'cloud', 50, 'a', { provider_errors: ['code-a'] })]); } catch (e) { threw = (e as Error).message; }
check('runs with provider errors are refused', threw.includes('provider errors'), threw);

console.log(failures ? `\n${failures} FAILED` : '\nall v4 profile tests passed');
process.exit(failures ? 1 : 0);
