// FNCALL suite grader tests: for every task and several seeds, the scripted
// correct call set scores 1 and plausible near-misses score below 1.
// Run: npx tsx test/v4-fncall.test.ts   (no Docker, no model calls)
import { taskRng } from '../src/v4/rng.js';
import { FNCALL_TASKS } from '../src/v4/tasks/fncall.js';
import type { ChatResponse, GradeContext, SingleInstance, ToolCall } from '../src/v4/types.js';

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  checks++;
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctx = {} as GradeContext; // fncall graders never touch the sandbox
const resp = (toolCalls: ToolCall[], text = ''): ChatResponse => ({ text, toolCalls, latencyMs: 1 });
const SEEDS = ['s1', 's2', 's3', 'alpha', 'beta', 'x9', 'q7'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

type Oracle = SingleInstance & { oracle?: ToolCall[] | null };
async function score(inst: SingleInstance, calls: ToolCall[], text = '') {
  return (await inst.grade(resp(calls, text), ctx)).score;
}

// Oracles for the two original tasks come from parsing their prompts.
function oracleParallelNested(p: string): ToolCall[] {
  const [, topic, mon, day, h, mi, ap, dur, p1, p2, ch, rem] = p.match(/Book "([^"]+)" on (\w+) (\d+), 2027 at (\d+):(\d+) (AM|PM) for (\d+) minutes with (\S+) and (\S+), and set a (\w+) reminder (\d+)/)!;
  const hour24 = ap === 'PM' && Number(h) !== 12 ? Number(h) + 12 : Number(h);
  const note = p.match(/exactly this text: "([^"]+)"/)![1];
  return [
    { id: 'a', name: 'create_event', arguments: { title: topic, date: `2027-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`, start: `${String(hour24).padStart(2, '0')}:${mi}`, duration_min: Number(dur), attendees: [p1, p2], reminder: { channel: ch.toLowerCase(), minutes_before: Number(rem) } } },
    { id: 'b', name: 'send_message', arguments: { to: p1, text: note } },
  ];
}

// Generic near-misses derived from an oracle call set.
function nearMisses(oracle: ToolCall[]): Array<[string, ToolCall[]]> {
  const out: Array<[string, ToolCall[]]> = [];
  out.push(['no calls', []]);
  if (oracle.length > 1) out.push(['drops one call', oracle.slice(1)]);
  out.push(['extra unneeded call', [...oracle, { id: 'z', name: 'get_weather', arguments: { city: 'Paris', date: '2027-01-01' } }]]);
  out.push(['duplicated call', [...oracle, clone(oracle[0])]]);
  // Mutate the first scalar field of the first call: wrong type, wrong value.
  const first = oracle[0];
  const key = Object.keys(first.arguments).find((k) => ['string', 'number', 'boolean'].includes(typeof first.arguments[k]));
  if (key) {
    const v = first.arguments[key];
    const wrongType = typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : Number.isNaN(Number(v)) ? 7 : Number(v);
    const wrongValue = typeof v === 'number' ? v + 1 : typeof v === 'boolean' ? !v : `${v}x`;
    for (const [label, val] of [['wrong type', wrongType], ['wrong value', wrongValue]] as const) {
      const m = clone(oracle);
      m[0].arguments[key] = val;
      out.push([`${label} on ${key}`, m]);
    }
  }
  out.push(['malformed arguments', oracle.map((c, i) => (i === 0 ? { ...c, arguments: {}, invalid: '{oops' } : c))]);
  return out;
}

for (const task of FNCALL_TASKS) {
  for (const seed of SEEDS) {
    const inst = task.build(taskRng(seed, task.id)) as Oracle;
    const p = inst.messages.map((m) => ('content' in m ? m.content : '')).join('\n');
    let oracle: ToolCall[] | null | undefined = inst.oracle;
    if (task.id === 'fncall-parallel-nested-1') oracle = oracleParallelNested(p);
    if (task.id === 'fncall-abstain-1') oracle = null;

    if (oracle === null) {
      check(`${task.id} declining passes [${seed}]`, (await score(inst, [], "I can't do that with the available tools. Could you tell me more?")) === 1);
      check(`${task.id} any call fails [${seed}]`, (await score(inst, [{ id: 'x', name: 'send_message', arguments: { to: 'ana@acme.io', text: 'hi' } }])) === 0);
      check(`${task.id} empty reply fails [${seed}]`, (await score(inst, [], '')) === 0);
      continue;
    }
    check(`${task.id} oracle passes [${seed}]`, (await score(inst, oracle)) === 1, (await inst.grade(resp(oracle), ctx)).detail);
    const reversed = [...oracle].reverse();
    check(`${task.id} call order does not matter [${seed}]`, (await score(inst, reversed)) === 1);
    for (const [label, calls] of nearMisses(oracle)) {
      const s = await score(inst, calls);
      check(`${task.id} ${label} scores < 1 [${seed}]`, s < 1, `got ${s}`);
    }
  }
}

// Task-specific traps the generic mutations don't cover.
{
  const t = FNCALL_TASKS.find((x) => x.id === 'fncall-optional-omit-1')!;
  for (const seed of SEEDS.slice(0, 5)) {
    const inst = t.build(taskRng(seed, t.id)) as Oracle;
    const o = clone(inst.oracle!);
    o[0].arguments.cabin = 'economy';
    check(`optional-omit: adding an unasked filter fails [${seed}]`, (await score(inst, o)) < 1);
    const o2 = clone(inst.oracle!);
    o2[0].arguments.return_date = null;
    check(`optional-omit: null return_date fails [${seed}]`, (await score(inst, o2)) < 1);
  }
}
{
  const t = FNCALL_TASKS.find((x) => x.id === 'fncall-optional-include-1')!;
  for (const seed of SEEDS.slice(0, 5)) {
    const inst = t.build(taskRng(seed, t.id)) as Oracle;
    const o = clone(inst.oracle!);
    delete o[0].arguments.max_stops;
    check(`optional-include: dropping max_stops fails [${seed}]`, (await score(inst, o)) < 1);
  }
}
{
  const t = FNCALL_TASKS.find((x) => x.id === 'fncall-enums-1')!;
  for (const seed of SEEDS.slice(0, 5)) {
    const inst = t.build(taskRng(seed, t.id)) as Oracle;
    const o = clone(inst.oracle!);
    (o[0].arguments.categories as string[]).reverse();
    check(`enums: category order does not matter [${seed}]`, (await score(inst, o)) === 1);
    const o2 = clone(inst.oracle!);
    o2[0].arguments.channel = 'text';
    check(`enums: non-enum channel fails [${seed}]`, (await score(inst, o2)) < 1);
    const o3 = clone(inst.oracle!);
    (o3[0].arguments.categories as string[]).push('marketing');
    check(`enums: extra category fails [${seed}]`, (await score(inst, o3)) < 1);
  }
}
{
  const t = FNCALL_TASKS.find((x) => x.id === 'fncall-types-strings-1')!;
  for (const seed of SEEDS.slice(0, 5)) {
    const inst = t.build(taskRng(seed, t.id)) as Oracle;
    const o = clone(inst.oracle!);
    o[0].arguments.recipient_zip = Number(o[0].arguments.recipient_zip);
    check(`types-strings: zip as number (lost leading zero) fails [${seed}]`, (await score(inst, o)) < 1);
    const o2 = clone(inst.oracle!);
    o2[0].arguments.weight_kg = (o2[0].arguments.weight_kg as number) * 1000;
    check(`types-strings: grams instead of kg fails [${seed}]`, (await score(inst, o2)) < 1);
  }
}
{
  const t = FNCALL_TASKS.find((x) => x.id === 'fncall-types-units-1')!;
  for (const seed of SEEDS.slice(0, 5)) {
    const inst = t.build(taskRng(seed, t.id)) as Oracle;
    const o = clone(inst.oracle!);
    o[0].arguments.duration_min = (o[0].arguments.duration_min as number) / 60;
    check(`types-units: hours instead of minutes fails [${seed}]`, (await score(inst, o)) < 1);
    const o2 = clone(inst.oracle!);
    o2[0].arguments.start = String(o2[0].arguments.start).replace(/T(\d\d)/, (_m, h) => `T${String(Number(h) - 12).padStart(2, '0')}`);
    check(`types-units: 12-hour clock fails [${seed}]`, (await score(inst, o2)) < 1);
  }
}
{
  const t = FNCALL_TASKS.find((x) => x.id === 'fncall-clarify-missing-1')!;
  const inst = t.build(taskRng('s1', t.id)) as SingleInstance;
  check('clarify: no call but no question is partial', (await score(inst, [], 'Okay, I will do that.')) === 0.5);
}
{
  const ids = new Set(FNCALL_TASKS.map((t) => t.id));
  check('14 fncall tasks with unique ids', FNCALL_TASKS.length === 14 && ids.size === 14, `${FNCALL_TASKS.length} tasks, ${ids.size} ids`);
  check('all tasks are in the fncall suite', FNCALL_TASKS.every((t) => t.suite === 'fncall'));
  const variety = new Set(SEEDS.map((s) => JSON.stringify(FNCALL_TASKS[2].build(taskRng(s, FNCALL_TASKS[2].id)).messages)));
  check('templates vary by seed', variety.size >= 5, `${variety.size} distinct`);
}

console.log(failures ? `\n${failures} of ${checks} FAILED` : `\nall ${checks} fncall grader tests passed`);
process.exit(failures ? 1 : 0);
