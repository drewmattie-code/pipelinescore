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
const SEEDS = ['s1', 's2', 's3', 'alpha', 'beta', 'x9', 'smoke1', 'pilot1', 'pilot2', 'harden1', 'q7', 'z3'];
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
    const printedTeam = p.match(new RegExp(`\\n${host}: team (\\w+),`))![1];
    const moves = [...p.matchAll(new RegExp(`\\n(2027-\\d\\d-\\d\\d): ${host} transferred from Team \\w+ to Team (\\w+)\\.`, 'g'))]
      .map((m) => ({ date: m[1], to: m[2] })).sort((a, b) => a.date.localeCompare(b.date));
    const team = moves.length ? moves[moves.length - 1].to : printedTeam;
    const [, printedMgr, deputy] = p.match(new RegExp(`Team ${team}: escalation manager ([^;]+); deputy ([^;]+);`))!;
    const upds = [...p.matchAll(new RegExp(`Effective (2027-\\d\\d-\\d\\d), the escalation manager for Team ${team} is ([A-Z][a-z]+ [A-Z][a-z]+) \\(previously`, 'g'))]
      .map((m) => ({ date: m[1], who: m[2] })).sort((a, b) => a.date.localeCompare(b.date));
    const manager = upds.length ? upds[upds.length - 1].who : printedMgr;
    // Plausible wrong: stop at the first transfer / first update, or read the printed tables.
    const wrong = moves.length
      ? { host, team: moves.length > 1 ? moves[0].to : printedTeam, manager }
      : { host, team, manager: upds.length > 1 ? upds[0].who : upds.length ? printedMgr : deputy };
    return { right: { host, team, manager }, wrong };
  },
  'longdoc-clause-xref-1': (p) => {
    const [, long, name] = p.match(/on (\w+ \d+, 2027), ([A-Z][a-z]+ [A-Z][a-z]+) sent a formal notice/)!;
    const [, project, body] = p.match(new RegExp(`From: ${name} <[^>]+> \\| Date: ${iso(long)} \\| Subject: ([^\\n]+) formal notice\\n([^\\n]*)`))!;
    const clause = body.match(/Clause (\d+\.\d+)/)![1];
    const cre = clause.replace('.', '\\.');
    const orig = p.match(new RegExp(`\\nClause ${cre}: [^.]+\\. Notice period: (\\d+) days\\. Early-termination fee: ([\\d.]+)%`))!;
    const rest = p.match(new RegExp(`\\nClause ${cre} \\(restated\\): Notice period: (\\d+) days\\. Early-termination fee: ([\\d.]+)%`));
    const [notice, fee] = rest ? [Number(rest[1]), Number(rest[2])] : [Number(orig[1]), Number(orig[2])];
    const [, originalV, remainingV] = p.match(new RegExp(`\\n${project}: original contract value \\$([\\d,]+); remaining contract value \\$([\\d,]+)`))!;
    const remaining = Number(remainingV.replace(/,/g, ''));
    const right = { clause, notice_days: notice, fee_dollars: Math.round((remaining * fee) / 100) };
    const wrong = rest
      ? { clause, notice_days: Number(orig[1]), fee_dollars: Math.round((remaining * Number(orig[2])) / 100) }
      : { ...right, fee_dollars: Math.round((Number(originalV.replace(/,/g, '')) * fee) / 100) };
    return { right, wrong };
  },
  'longdoc-amendments-1': (p) => {
    const [, asOfLong, city, days] = p.match(/as of (\w+ \d+, 2027), counting only amendments[^?]*? per-diem for (.+?), which amendment set it, and what is the total per-diem for a (\d+)-day trip/)!;
    const asOf = iso(asOfLong);
    const rescinded = new Set([...p.matchAll(/Amendment (A-\d+) is rescinded\./g)].map((m) => m[1]));
    const corrected = new Map([...p.matchAll(/Amendment (A-\d+): effective date corrected to (2027-\d\d-\d\d)\./g)].map((m) => [m[1], m[2]]));
    const printed = [...p.matchAll(new RegExp(`Amendment (A-\\d+) \\(effective (2027-\\d\\d-\\d\\d)\\): per-diem for ${city} set to \\$(\\d+)`, 'g'))]
      .map((m) => ({ id: m[1], date: m[2], rate: Number(m[3]) }));
    const pick = (hs: typeof printed) => hs.filter((h) => h.date <= asOf && !rescinded.has(h.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
    const win = pick(printed.map((h) => ({ ...h, date: corrected.get(h.id) ?? h.date })));
    const noCorrections = pick(printed);
    const naive = [...printed].sort((a, b) => b.date.localeCompare(a.date))[0];
    const decoy = noCorrections && noCorrections.id !== win.id ? noCorrections : naive.id !== win.id ? naive : printed.find((h) => h.id !== win.id)!;
    const t = (h: { id: string; rate: number }) => ({ per_diem: h.rate, amendment: h.id, trip_total: h.rate * Number(days) });
    return { right: t(win), wrong: t(decoy) };
  },
  'longdoc-abstain-1': (p) => {
    const ids = p.match(/warranty, in months, of model ([A-Z]{2}-\d{4}), of model ([A-Z]{2}-\d{4}), of model ([A-Z]{2}-\d{4}), and of model ([A-Z]{2}-\d{4})\?/)!.slice(1);
    const look = (id: string) => {
      const erratum = p.match(new RegExp(`Model ${id}: warranty is (\\d+) months`));
      if (erratum) return Number(erratum[1]);
      const m = p.match(new RegExp(`Model ${id} \\| series \\w+ \\| warranty (\\d+) months`));
      return m ? Number(m[1]) : NOT_IN_DOC;
    };
    const naive = (id: string) => {
      const printed = p.match(new RegExp(`Model ${id} \\| series \\w+ \\| warranty (\\d+) months`));
      const plan = p.match(new RegExp(`Model ${id} \\| discontinued \\| service plan (\\d+) months`));
      return printed ? Number(printed[1]) : plan ? Number(plan[1]) : NOT_IN_DOC;
    };
    const keys = ['first', 'second', 'third', 'fourth'];
    return {
      right: Object.fromEntries(keys.map((k, i) => [k, look(ids[i])])),
      wrong: Object.fromEntries(keys.map((k, i) => [k, naive(ids[i])])),
    };
  },
  'longdoc-bounded-count-1': (p) => {
    const site = p.match(/at site (\w+) with severity HIGH/)![1];
    const s7 = section(p, '## Section 7: current findings register (as printed)');
    const s9 = section(p, '## Section 9: status updates since the register was printed');
    const upd = new Map([...s9.matchAll(/(F-\d+): status changed to ([A-Z ]+?)\./g)].map((m) => [m[1], m[2]]));
    const rows = [...s7.matchAll(/(F-\d+) \| site: (\w+) \| severity: (\w+) \| status: ([A-Z ]+?) \| area/g)].filter((m) => m[2] === site && m[3] === 'HIGH');
    const ids = rows.filter((m) => (upd.get(m[1]) ?? m[4]) === 'OPEN').map((m) => m[1]);
    const printed = rows.filter((m) => m[4] === 'OPEN').map((m) => m[1]);
    return { right: { count: ids.length, ids }, wrong: { count: printed.length, ids: printed } };
  },
};

for (const t of LONGDOC_TASKS) {
  check(`${t.id} has an oracle`, !!ORACLES[t.id]);
  for (const seed of SEEDS) {
    const inst = t.build(taskRng(seed, t.id)) as SingleInstance;
    const p = (inst.messages[0] as { content: string }).content;
    const docLen = p.indexOf('\n\n---\n');
    check(`${t.id} doc size in window [${seed}]`, docLen >= DOC_MIN_CHARS && docLen <= DOC_MAX_CHARS, `${docLen} chars`);
    // Must fit a 32K-token local context with room to answer (~5.4 chars/token measured).
    check(`${t.id} prompt fits a 32K context [${seed}]`, p.length / 5.4 < 26_000, `${p.length} chars`);
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
