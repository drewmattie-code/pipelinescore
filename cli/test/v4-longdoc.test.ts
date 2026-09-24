// Long-document grader tests: for every task and seed, an oracle that PARSES the
// document text must reach the answer the grader expects (score 1), a plausible
// wrong answer must score below 1, and the document must land in the size window.
// Run: npx tsx test/v4-longdoc.test.ts   (no Docker, no model calls)
import { taskRng } from '../src/v4/rng.js';
import { DOC_MAX_CHARS, DOC_MIN_CHARS, LONGDOC_TASKS, NOT_IN_DOC } from '../src/v4/tasks/longdoc.js';
import type { ChatResponse, GradeContext, SingleInstance } from '../src/v4/types.js';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctx = {} as GradeContext; // longdoc graders never touch the sandbox
const resp = (text: string): ChatResponse => ({ text, toolCalls: [], latencyMs: 1 });
const SEEDS = ['s1', 's2', 's3', 'alpha', 'beta', 'x9', 'smoke1', 'pilot1'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const iso = (long: string) => {
  const [, mon, d] = long.match(/(\w+) (\d+), 2027/)!;
  return `2027-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
};
const section = (doc: string, heading: string) => {
  const start = doc.indexOf(heading);
  const rest = doc.slice(start + heading.length);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
};

type Oracle = (prompt: string) => { right: Record<string, unknown>; wrong: Record<string, unknown> };

const ORACLES: Record<string, Oracle> = {
  'longdoc-two-hop-1': (p) => {
    const ticket = p.match(/ticket (INC-\d+) was raised/)![1];
    const host = p.match(new RegExp(`\\| (srv-\\d+) \\| [\\w-]+ \\| outage \\d+ min \\| ${ticket} \\|`))![1];
    const team = p.match(new RegExp(`\\n${host}: team (\\w+),`))![1];
    const [, manager, deputy] = p.match(new RegExp(`Team ${team}: escalation manager ([^;]+); deputy ([^;]+);`))!;
    return { right: { host, team, manager }, wrong: { host, team, manager: deputy } };
  },
  'longdoc-clause-xref-1': (p) => {
    const [, long, name] = p.match(/on (\w+ \d+, 2027), ([A-Z][a-z]+ [A-Z][a-z]+) sent a formal notice/)!;
    const header = new RegExp(`From: ${name} <[^>]+> \\| Date: ${iso(long)} \\|[^\\n]*\\n([^\\n]*)`);
    const body = p.match(header)![1];
    const clause = body.match(/Clause (\d+\.\d+)/)![1];
    const [, notice, fee] = p.match(new RegExp(`\\nClause ${clause.replace('.', '\\.')}: [^.]+\\. Notice period: (\\d+) days\\. Early-termination fee: ([\\d.]+)%`))!;
    return {
      right: { clause, notice_days: Number(notice), fee_percent: Number(fee) },
      wrong: { clause, notice_days: Number(notice) + 15, fee_percent: Number(fee) },
    };
  },
  'longdoc-amendments-1': (p) => {
    const city = p.match(/current daily per-diem for ([\w ]+?), and which/)![1];
    const hits = [...p.matchAll(new RegExp(`Amendment (A-\\d+) \\(effective (2027-\\d\\d-\\d\\d)\\): per-diem for ${city} set to \\$(\\d+)`, 'g'))]
      .map((m) => ({ id: m[1], date: m[2], rate: Number(m[3]) }));
    const latest = [...hits].sort((a, b) => b.date.localeCompare(a.date))[0];
    const lastInText = hits[hits.length - 1];
    const byId = [...hits].sort((a, b) => Number(b.id.slice(2)) - Number(a.id.slice(2)))[0];
    const decoy = lastInText.id !== latest.id ? lastInText : byId;
    return { right: { per_diem: latest.rate, amendment: latest.id }, wrong: { per_diem: decoy.rate, amendment: decoy.id } };
  },
  'longdoc-abstain-1': (p) => {
    const [, a, b] = p.match(/warranty, in months, of model ([A-Z]{2}-\d{4}), and of model ([A-Z]{2}-\d{4})\?/)!;
    const look = (id: string) => {
      const m = p.match(new RegExp(`Model ${id} \\| series \\w+ \\| warranty (\\d+) months`));
      return m ? Number(m[1]) : NOT_IN_DOC;
    };
    const right = { first: look(a), second: look(b) };
    // Plausible wrong: guess the present model's value for the missing one.
    const present = right.first === NOT_IN_DOC ? right.second : right.first;
    return { right, wrong: { first: present, second: present } };
  },
  'longdoc-bounded-count-1': (p) => {
    const site = p.match(/at site (\w+) with severity HIGH/)![1];
    const s7 = section(p, '## Section 7: current findings register');
    const ids = [...s7.matchAll(/(F-\d+) \| site: (\w+) \| severity: (\w+) \| status: ([A-Z ]+?) \| area/g)]
      .filter((m) => m[2] === site && m[3] === 'HIGH' && m[4] === 'OPEN').map((m) => m[1]);
    const whole = [...p.matchAll(/(F-\d+) \| site: (\w+) \| severity: (\w+) \| status: ([A-Z ]+?) \| area/g)]
      .filter((m) => m[2] === site && m[3] === 'HIGH' && m[4] === 'OPEN').map((m) => m[1]);
    return { right: { count: ids.length, ids }, wrong: { count: whole.length, ids: whole } };
  },
};

for (const t of LONGDOC_TASKS) {
  check(`${t.id} has an oracle`, !!ORACLES[t.id]);
  for (const seed of SEEDS) {
    const inst = t.build(taskRng(seed, t.id)) as SingleInstance;
    const p = (inst.messages[0] as { content: string }).content;
    const docLen = p.indexOf('\n\n---\n');
    check(`${t.id} doc size in window [${seed}]`, docLen >= DOC_MIN_CHARS && docLen <= DOC_MAX_CHARS, `${docLen} chars`);
    let o: ReturnType<Oracle>;
    try { o = ORACLES[t.id](p); } catch (e) { check(`${t.id} oracle parses doc [${seed}]`, false, (e as Error).message); continue; }
    const ok = await inst.grade(resp(JSON.stringify(o.right)), ctx);
    const fenced = await inst.grade(resp('Here is the answer:\n```json\n' + JSON.stringify(o.right, null, 2) + '\n```'), ctx);
    const bad = await inst.grade(resp(JSON.stringify(o.wrong)), ctx);
    const empty = await inst.grade(resp(''), ctx);
    check(`${t.id} oracle scores 1 [${seed}]`, ok.score === 1, ok.detail);
    check(`${t.id} fenced answer still parses [${seed}]`, fenced.score === 1, fenced.detail);
    check(`${t.id} plausible wrong answer < 1 [${seed}]`, bad.score < 1, `${bad.score} ${bad.detail}`);
    check(`${t.id} silence scores 0 [${seed}]`, empty.score === 0);
  }
}

// Determinism: same seed → same prompt; different seed → different prompt.
for (const t of LONGDOC_TASKS) {
  const a = (t.build(taskRng('same', t.id)) as SingleInstance).messages[0] as { content: string };
  const b = (t.build(taskRng('same', t.id)) as SingleInstance).messages[0] as { content: string };
  const c = (t.build(taskRng('other', t.id)) as SingleInstance).messages[0] as { content: string };
  check(`${t.id} deterministic per seed`, a.content === b.content);
  check(`${t.id} varies across seeds`, a.content !== c.content);
}

console.log(failures ? `\n${failures} FAILED` : '\nall longdoc grader tests passed');
process.exit(failures ? 1 : 0);
