// v4 core tests: seeding, the task registry, and scoring. Per-suite grader
// proofs live in test/v4-<suite>.test.ts.
// Run: npx tsx test/v4.test.ts
import { taskRng } from '../src/v4/rng.js';
import { V4_TASKS } from '../src/v4/tasks/index.js';
import { SUITE_WEIGHTS, runTask, summarize } from '../src/v4/runner.js';
import type { ChatProvider, ToolCall } from '../src/v4/types.js';
import type { V4TaskResult } from '../src/v4/types.js';
import { createServer } from 'node:http';
import { OpenAIChatProvider } from '../src/v4/providers.js';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── rng is deterministic and task-isolated ─────────────────────────────────
{
  const a = taskRng('seed', 't').int(0, 1e9);
  const b = taskRng('seed', 't').int(0, 1e9);
  const c = taskRng('seed', 'other').int(0, 1e9);
  check('same seed+task → same draw', a === b);
  check('different task → different draw', a !== c);
}

// ── registry ────────────────────────────────────────────────────────────────
{
  const ids = V4_TASKS.map((t) => t.id);
  check('task ids are unique', new Set(ids).size === ids.length);
  const suites = new Set(V4_TASKS.map((t) => t.suite));
  check('every weighted suite has tasks', Object.keys(SUITE_WEIGHTS).every((s) => suites.has(s as never)));
  const weightSum = Object.values(SUITE_WEIGHTS).reduce((a, b) => a + b, 0);
  check('suite weights sum to 1', Math.abs(weightSum - 1) < 1e-9, String(weightSum));
  for (const t of V4_TASKS) {
    let ok = true;
    let err = '';
    const prompts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      try {
        const inst = t.build(taskRng(`reg${i}`, t.id));
        prompts.add(JSON.stringify(inst.messages));
        const again = t.build(taskRng(`reg${i}`, t.id));
        if (JSON.stringify(again.messages) !== JSON.stringify(inst.messages)) { ok = false; err = 'same seed built a different prompt'; }
      } catch (e) { ok = false; err = (e as Error).message; }
    }
    check(`${t.id} builds reproducibly for 20 seeds`, ok, err);
    // Code, repo and agent tasks keep a fixed spec; their hidden tests or mock
    // world vary instead. Everywhere else the values live in the prompt.
    if (!['code', 'repo', 'agent'].includes(t.suite)) {
      check(`${t.id} prompt varies across seeds`, prompts.size >= 5, `${prompts.size} distinct prompts in 20 seeds`);
    }
  }
}

// ── scoring: speed never moves the quality score ──────────────────────────────
{
  const base = (s: V4TaskResult['suite'], score: number, lat: number): V4TaskResult =>
    ({ task_id: `${s}-${lat}`, suite: s, score, detail: '', response: '', turns: 1, latency_ms: lat, tokens_in: 10, tokens_out: 100 });
  const fast = summarize([base('code', 1, 100), base('agent', 0.5, 100), base('reason', 1, 100), base('fncall', 1, 100)]);
  const slow = summarize([base('code', 1, 90000), base('agent', 0.5, 90000), base('reason', 1, 90000), base('fncall', 1, 90000)]);
  check('speed does not change pipeline_score', fast.pipeline_score === slow.pipeline_score, `${fast.pipeline_score} vs ${slow.pipeline_score}`);
  check('speed is still reported', fast.speed.tps_p50 !== null && slow.speed.tps_p50 !== null && fast.speed.tps_p50 > slow.speed.tps_p50!);
}

// ── one-call-per-message models get credit for sequential calls ──────────────
{
  const t = V4_TASKS.find((x) => x.id === 'fncall-parallel-same-1')!;
  const seed = 'seq1';
  const oracle = (t.build(taskRng(seed, t.id)) as unknown as { oracle: ToolCall[] }).oracle;
  // dupFirst: repeats the first call before finishing, so no prefix is ever exact.
  const mk = (perTurn: number, dupFirst = false): ChatProvider => {
    const seq = dupFirst ? [oracle[0], ...oracle] : oracle;
    let i = 0;
    return {
      name: 'fake', model: 'fake',
      async chat() {
        const batch = seq.slice(i, i + perTurn);
        i += perTurn;
        return { text: batch.length ? '' : 'done', toolCalls: batch, latencyMs: 1 };
      },
    };
  };
  const ctx = { sandbox: { run: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) } };
  const oneAtATime = await runTask(t, seed, mk(1), ctx);
  const allAtOnce = await runTask(t, seed, mk(oracle.length), ctx);
  const withDup = await runTask(t, seed, mk(1, true), ctx);
  check('sequential single calls score like parallel ones', oneAtATime.score === 1 && allAtOnce.score === 1, `${oneAtATime.score} ${allAtOnce.score} ${oneAtATime.detail}`);
  check('a repeated call before finishing still costs points', withDup.score < 1, withDup.detail);
  // Correct calls first, then an unrequested call after the "ok": credit stays.
  let turn = 0;
  const wanders: ChatProvider = {
    name: 'fake', model: 'fake',
    async chat() {
      turn++;
      if (turn === 1) return { text: '', toolCalls: oracle, latencyMs: 1 };
      if (turn === 2) return { text: '', toolCalls: [{ id: 'z', name: 'get_forecast', arguments: { city: 'Nowhere', date: '2027-01-01', units: 'metric' } }], latencyMs: 1 };
      return { text: 'done', toolCalls: [], latencyMs: 1 };
    },
  };
  const wandered = await runTask(t, seed, wanders, ctx);
  check('an extra call after the task is done does not remove credit', wandered.score === 1, wandered.detail);
}

// ── a crashed server's empty 200 is an error, not a wrong answer ─────────────
{
  const bodies = [
    // what Ollama returned after a Metal compute error
    { id: 'x', object: 'chat.completion', model: '', choices: [{ index: 0, message: { role: '', content: '' }, finish_reason: null }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
    // a legitimate empty answer: tokens were processed and the model stopped
    { id: 'y', object: 'chat.completion', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } },
  ];
  let i = 0;
  const server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(bodies[i++])); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const p = new OpenAIChatProvider('local', 'm', { baseURL: `http://127.0.0.1:${port}/v1` });
  let threw = false;
  try { await p.chat([{ role: 'user', content: 'hi' }], { maxTokens: 10 }); } catch { threw = true; }
  check('empty no-token completion throws', threw);
  let ok = false;
  try { const r = await p.chat([{ role: 'user', content: 'hi' }], { maxTokens: 10 }); ok = r.text === ''; } catch { ok = false; }
  check('real empty answer is returned, not thrown', ok);
  server.close();
}

console.log(failures ? `\n${failures} FAILED` : '\nall v4 core tests passed');
process.exit(failures ? 1 : 0);
