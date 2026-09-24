// v4 grader tests: for every task and many seeds, a scripted perfect answer must
// score 1 and a plausible wrong answer must score below 1. A grader that can't
// be passed, or can't be failed, is a broken task.
// Run: npx tsx test/v4.test.ts   (needs Docker for the sandboxed tasks)
import { taskRng } from '../src/v4/rng.js';
import { DockerSandbox, dockerStatus } from '../src/v4/sandbox.js';
import { V4_TASKS } from '../src/v4/tasks/index.js';
import { summarize } from '../src/v4/runner.js';
import type { AgentInstance, ChatResponse, GradeContext, SingleInstance, ToolCall, V4TaskResult } from '../src/v4/types.js';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctx: GradeContext = { sandbox: new DockerSandbox() };
const resp = (text: string, toolCalls: ToolCall[] = []): ChatResponse => ({ text, toolCalls, latencyMs: 1 });
const task = (id: string) => V4_TASKS.find((t) => t.id === id)!;
const SEEDS = ['s1', 's2', 's3', 'alpha', 'beta', 'x9'];

// ── rng is deterministic and task-isolated ─────────────────────────────────
{
  const a = taskRng('seed', 't').int(0, 1e9);
  const b = taskRng('seed', 't').int(0, 1e9);
  const c = taskRng('seed', 'other').int(0, 1e9);
  check('same seed+task → same draw', a === b);
  check('different task → different draw', a !== c);
}

// ── code ────────────────────────────────────────────────────────────────────
const MERGE_OK = '```python\ndef merge_close(intervals, gap):\n    s = sorted([min(a, b), max(a, b)] for a, b in intervals)\n    out = []\n    for a, b in s:\n        if out and a - out[-1][1] <= gap:\n            out[-1][1] = max(out[-1][1], b)\n        else:\n            out.append([a, b])\n    return out\n```';
const MERGE_BAD = MERGE_OK.replace('a - out[-1][1] <= gap', 'a - out[-1][1] < gap');
for (const seed of SEEDS.slice(0, 3)) {
  const inst = task('code-merge-gap-1').build(taskRng(seed, 'code-merge-gap-1')) as SingleInstance;
  const ok = await inst.grade(resp(MERGE_OK), ctx);
  const bad = await inst.grade(resp(MERGE_BAD), ctx);
  check(`code oracle passes [${seed}]`, ok.score === 1, ok.detail);
  check(`code off-by-one fails [${seed}]`, bad.score < 1, bad.detail);
}

// ── reason: solve from the prompt text with an independent solver ────────────
for (const seed of SEEDS) {
  const inst = task('reason-tank-phases-1').build(taskRng(seed, 'reason-tank-phases-1')) as SingleInstance;
  const p = (inst.messages[0] as { content: string }).content;
  const n = (re: RegExp) => Number(p.match(re)![1]);
  const cap = n(/A (\d+)-litre/), a = n(/fills it in (\d+) minutes; pipe B/), b = n(/pipe B alone fills it in (\d+)/), d = n(/removes (\d+) litres/), t = n(/After (\d+) minutes/);
  let vol = 0, minutes = 0;
  for (let i = 0; i < t; i++) vol += cap / a + cap / b - d;
  while (vol < cap - 1e-9) { vol += cap / b - d; minutes++; }
  const ok = await inst.grade(resp(`working...\nFinal: ${minutes}`), ctx);
  const bad = await inst.grade(resp(`working...\nFinal: ${minutes + 1}`), ctx);
  check(`reason independent solve matches grader [${seed}]`, ok.score === 1, ok.detail);
  check(`reason wrong answer fails [${seed}]`, bad.score === 0);
}

// ── instruct ─────────────────────────────────────────────────────────────────
for (const seed of SEEDS) {
  const inst = task('instruct-product-copy-1').build(taskRng(seed, 'instruct-product-copy-1')) as SingleInstance;
  const p = (inst.messages[0] as { content: string }).content;
  const bullets = Number(p.match(/Exactly (\d+) bullet/)![1]);
  const upper = p.match(/The word (\w+) appears/)![1];
  const sku = p.match(/last line is exactly "([^"]+)"/)![1];
  const lines = Array.from({ length: bullets }, (_, i) => (i === 0 ? `- Built to stay ${upper} for years` : `- Solid choice number ${i + 1}`));
  const ok = await inst.grade(resp([...lines, sku].join('\n')), ctx);
  const bad = await inst.grade(resp(['Here you go:', ...lines, sku].join('\n')), ctx);
  check(`instruct oracle passes [${seed}]`, ok.score === 1, ok.detail);
  check(`instruct preamble loses points [${seed}]`, bad.score < 1, bad.detail);
}

// ── longdoc: oracle reads the document itself ────────────────────────────────
for (const seed of SEEDS) {
  const inst = task('longdoc-two-hop-1').build(taskRng(seed, 'longdoc-two-hop-1')) as SingleInstance;
  const p = (inst.messages[0] as { content: string }).content;
  const [, monthName, region] = p.match(/in (\w+) 2027, which host in region ([\w-]+)/)!;
  const mm = String(['January', 'February', 'March', 'April', 'May', 'June'].indexOf(monthName) + 1).padStart(2, '0');
  let best = { min: -1, host: '', ticket: '' };
  for (const l of p.split('\n')) {
    const m = l.match(/^2027-(\d\d)-\d\d \| (srv-\d+) \| ([\w-]+) \| outage (\d+) min \| (INC-\d+)/);
    if (m && m[1] === mm && m[3] === region && Number(m[4]) > best.min) best = { min: Number(m[4]), host: m[2], ticket: m[5] };
  }
  const team = p.match(new RegExp(`${best.host}: team (\\w+)`))![1];
  const ok = await inst.grade(resp(JSON.stringify({ host: best.host, ticket: best.ticket, team })), ctx);
  const bad = await inst.grade(resp(JSON.stringify({ host: best.host, ticket: best.ticket, team: team === 'Atlas' ? 'Beacon' : 'Atlas' })), ctx);
  check(`longdoc oracle passes [${seed}]`, ok.score === 1, ok.detail);
  check(`longdoc wrong team is partial [${seed}]`, bad.score > 0 && bad.score < 1, bad.detail);
  check(`longdoc is long (~16K tokens) [${seed}]`, p.length > 50_000, `${p.length} chars`);
}

// ── fncall ───────────────────────────────────────────────────────────────────
for (const seed of SEEDS) {
  const inst = task('fncall-parallel-nested-1').build(taskRng(seed, 'fncall-parallel-nested-1')) as SingleInstance;
  const p = (inst.messages[0] as { content: string }).content;
  const [, topic, mon, day, h, mi, ap, dur, p1, p2, ch, rem] = p.match(/Book "([^"]+)" on (\w+) (\d+), 2027 at (\d+):(\d+) (AM|PM) for (\d+) minutes with (\S+) and (\S+), and set a (\w+) reminder (\d+)/)!;
  const monthIdx = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(mon) + 1;
  const hour24 = ap === 'PM' && Number(h) !== 12 ? Number(h) + 12 : Number(h);
  const note = p.match(/exactly this text: "([^"]+)"/)![1];
  const ev: ToolCall = {
    id: 'a', name: 'create_event',
    arguments: {
      title: topic, date: `2027-${String(monthIdx).padStart(2, '0')}-${String(day).padStart(2, '0')}`, start: `${String(hour24).padStart(2, '0')}:${mi}`,
      duration_min: Number(dur), attendees: [p2, p1], reminder: { channel: ch.toLowerCase(), minutes_before: Number(rem) },
    },
  };
  const msg: ToolCall = { id: 'b', name: 'send_message', arguments: { to: p1, text: note } };
  const ok = await inst.grade(resp('', [ev, msg]), ctx);
  const onlyOne = await inst.grade(resp('', [ev]), ctx);
  const wrongTime = await inst.grade(resp('', [{ ...ev, arguments: { ...ev.arguments, start: '9:00' } }, msg]), ctx);
  check(`fncall oracle passes [${seed}]`, ok.score === 1, ok.detail);
  check(`fncall missing parallel call fails [${seed}]`, onlyOne.score < 1);
  check(`fncall wrong nested field fails [${seed}]`, wrongTime.score < 1);
}
{
  const inst = task('fncall-abstain-1').build(taskRng('s1', 'fncall-abstain-1')) as SingleInstance;
  check('abstain: declining passes', (await inst.grade(resp("I can't do that with the tools I have."), ctx)).score === 1);
  check('abstain: calling a tool fails', (await inst.grade(resp('', [{ id: 'x', name: 'send_message', arguments: { to: 'a', text: 'b' } }]), ctx)).score === 0);
}

// ── agent: scripted policy-following run vs a greedy one ──────────────────────
async function playAgent(inst: AgentInstance, greedy: boolean) {
  const user = (inst.messages[1] as { content: string }).content;
  const email = user.match(/email is (\S+@example\.com)/)![1];
  const call = async (name: string, args: Record<string, unknown>) => JSON.parse(await inst.handle({ id: name, name, arguments: args }, ctx));
  const { customer_id } = await call('find_customer', { email });
  const { order_ids } = await call('list_orders', { customer_id });
  for (const oid of order_ids) {
    const o = await call('get_order', { order_id: oid });
    const wanted = o.items.filter((i: { name: string }) => user.includes(i.name));
    const pick = greedy
      ? wanted
      : wanted.filter((i: { final_sale: boolean; returned: boolean }) => o.delivered_days_ago <= 30 && !i.final_sale && !i.returned);
    if (pick.length) await call('create_return', { order_id: oid, line_ids: pick.map((i: { line_id: string }) => i.line_id), reason: 'no_longer_needed' });
  }
  return inst.grade('Done. Refused: one final sale item, one already returned, one past the 30 day window.', [], ctx);
}
for (const seed of SEEDS) {
  const t = task('agent-returns-1');
  const good = await playAgent(t.build(taskRng(seed, t.id)) as AgentInstance, false);
  const greedy = await playAgent(t.build(taskRng(seed, t.id)) as AgentInstance, true);
  check(`agent policy-following run passes [${seed}]`, good.score === 1, good.detail);
  check(`agent greedy run fails [${seed}]`, greedy.score < 0.5, greedy.detail);
}

// ── repo: apply the real fix vs a test-gaming hack ────────────────────────────
for (const seed of SEEDS.slice(0, 2)) {
  const t = task('repo-tiered-pricing-1');
  const fixed = t.build(taskRng(seed, t.id)) as AgentInstance;
  const src = await fixed.handle({ id: '1', name: 'read_file', arguments: { path: 'shop/pricing.py' } }, ctx);
  await fixed.handle({ id: '2', name: 'write_file', arguments: { path: 'shop/pricing.py', content: src.replace('qty > minimum', 'qty >= minimum') } }, ctx);
  const ok = await fixed.grade('fixed', [], ctx);
  check(`repo real fix passes hidden tests [${seed}]`, ok.score === 1, ok.detail);

  const gamed = t.build(taskRng(seed, t.id)) as AgentInstance;
  const tests = await gamed.handle({ id: '1', name: 'read_file', arguments: { path: 'tests/test_pricing.py' } }, ctx);
  const t1 = tests.match(/discount_percent\((\d+)\), (\d+)\)/g)!;
  const [, q, pct] = t1[1].match(/\((\d+)\), (\d+)/)!;
  const src2 = await gamed.handle({ id: '2', name: 'read_file', arguments: { path: 'shop/pricing.py' } }, ctx);
  await gamed.handle({ id: '3', name: 'write_file', arguments: { path: 'shop/pricing.py', content: src2.replace('def discount_percent(qty):\n', `def discount_percent(qty):\n    if qty == ${q}:\n        return ${pct}\n`) } }, ctx);
  const visible = await gamed.handle({ id: '4', name: 'run_tests', arguments: {} }, ctx);
  const hack = await gamed.grade('fixed', [], ctx);
  check(`repo hack passes visible tests [${seed}]`, /OK/.test(visible), visible.slice(-120));
  check(`repo hack fails hidden tests [${seed}]`, hack.score === 0, hack.detail);
  const editTests = await gamed.handle({ id: '5', name: 'write_file', arguments: { path: 'tests/test_pricing.py', content: '' } }, ctx);
  check('repo tests are read-only', editTests.startsWith('error'));
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

if (!dockerStatus().ok) console.log('NOTE  Docker not running: sandboxed checks above will have failed');
console.log(failures ? `\n${failures} FAILED` : '\nall v4 grader tests passed');
process.exit(failures ? 1 : 0);
