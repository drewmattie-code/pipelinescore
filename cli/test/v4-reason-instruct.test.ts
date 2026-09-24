// v4 REASON + INSTRUCT proofs.
// Reason: an independent solver parses each prompt, and its answer must match
// the grader's key; a wrong answer must fail; each template must produce
// >= 300 distinct prompts over 500 seeds.
// Instruct: an answer built from the prompt's own rules must score 1, and one
// deliberate violation must score < 1.
// Run: npx tsx test/v4-reason-instruct.test.ts   (no Docker, no model calls)
import { taskRng } from '../src/v4/rng.js';
import { REASON_TASKS } from '../src/v4/tasks/reason.js';
import { INSTRUCT_TASKS } from '../src/v4/tasks/instruct.js';
import type { ChatResponse, GradeContext, SingleInstance, V4Task } from '../src/v4/types.js';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) passes++;
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctx = { sandbox: null } as unknown as GradeContext;
const resp = (text: string): ChatResponse => ({ text, toolCalls: [], latencyMs: 1 });
const promptOf = (t: V4Task, seed: string) => {
  const inst = t.build(taskRng(seed, t.id)) as SingleInstance;
  return { inst, p: inst.messages.map((m) => ('content' in m ? m.content : '')).join('\n') };
};
const byId = (xs: V4Task[], id: string) => xs.find((t) => t.id === id)!;
const num = (p: string, re: RegExp) => Number(p.match(re)![1]);

// ── independent helpers (deliberately not shared with src) ────────────────────
function bgcd(a: bigint, b: bigint): bigint { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }
function fstr(n: bigint, d: bigint): string {
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d) || 1n;
  n /= g; d /= g;
  return d === 1n ? `${n}` : `${n}/${d}`;
}
function combos<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [h, ...rest] = xs;
  return [...combos(rest, k - 1).map((c) => [h, ...c]), ...combos(rest, k)];
}
function permsDistinct(s: string): Set<string> {
  const out = new Set<string>();
  const rec = (cur: string, rest: string) => {
    if (!rest) { out.add(cur); return; }
    const seen = new Set<string>();
    for (let i = 0; i < rest.length; i++) {
      if (seen.has(rest[i])) continue;
      seen.add(rest[i]);
      rec(cur + rest[i], rest.slice(0, i) + rest.slice(i + 1));
    }
  };
  rec('', s);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SUN0 = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const solvers: Record<string, (p: string) => string> = {
  'reason-tank-phases-1': (p) => {
    const cap = num(p, /A (\d+)-litre/), a = num(p, /fills it in (\d+) minutes; pipe B/), b = num(p, /pipe B alone fills it in (\d+)/);
    const d = num(p, /removes (\d+) litres/), t = num(p, /After (\d+) minutes/);
    let vol = 0, minutes = 0;
    for (let i = 0; i < t; i++) vol += cap / a + cap / b - d;
    while (vol < cap - 1e-9) { vol += cap / b - d; minutes++; }
    return `${minutes}`;
  },
  'reason-prob-draw-1': (p) => {
    const m = p.match(/holds (\d+) (\w+), (\d+) (\w+) and (\d+) (\w+) \w+\. You draw (\d+) at random.*exactly (\d+) of them are (\w+)\?/)!;
    const balls: string[] = [];
    for (const [c, col] of [[m[1], m[2]], [m[3], m[4]], [m[5], m[6]]]) for (let i = 0; i < Number(c); i++) balls.push(col);
    const all = combos(balls.map((c, i) => ({ c, i })), Number(m[7]));
    const hit = all.filter((cm) => cm.filter((x) => x.c === m[9]).length === Number(m[8])).length;
    return fstr(BigInt(hit), BigInt(all.length));
  },
  'reason-count-arrange-1': (p) => {
    const m = p.match(/string "(\w+)" have no two (\w)'s/)!;
    const target = m[2];
    let n = 0;
    for (const s of permsDistinct(m[1])) if (!s.includes(target + target)) n++;
    return `${n}`;
  },
  'reason-weekday-count-1': (p) => {
    const m = p.match(/^(\w+) (\d+), (\d+) is a (\w+)\. How many (\w+)s are there from .* through (\w+) (\d+), (\d+),/)!;
    const start = Date.UTC(Number(m[3]), MONTHS.indexOf(m[1]), Number(m[2]));
    const end = Date.UTC(Number(m[8]), MONTHS.indexOf(m[6]), Number(m[7]));
    if (DAYS_SUN0[new Date(start).getUTCDay()] !== m[4]) return 'STATED-WEEKDAY-WRONG';
    let n = 0;
    for (let t = start; t <= end; t += 86400000) if (DAYS_SUN0[new Date(t).getUTCDay()] === m[5]) n++;
    return `${n}`;
  },
  'reason-logic-grid-1': (p) => {
    const vals = [
      p.match(/residents ([^;]+);/)![1].split(', '),
      p.match(/pets ([^;]+);/)![1].split(', '),
      p.match(/drinks ([^.\n]+)\.?\n/)![1].replace(/\.$/, '').split(', '),
    ];
    const ent = (s: string): [number, string] => {
      const t = s.trim();
      const pm = t.match(/^the (\w+) owner$/i); if (pm) return [1, pm[1]];
      const dm = t.match(/^the (\w+) drinker$/i); if (dm) return [2, dm[1]];
      return [0, t];
    };
    type A = string[][];
    const pos = (a: A, e: [number, string]) => a[e[0]].indexOf(e[1]);
    const preds: Array<(a: A) => boolean> = [];
    for (const line of p.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2))) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(.+) does not live in house (\d)\.$/))) { const e = ent(m[1]), k = Number(m[2]) - 1; preds.push((a) => pos(a, e) !== k); }
      else if ((m = line.match(/^(.+) lives in house (\d)\.$/))) { const e = ent(m[1]), k = Number(m[2]) - 1; preds.push((a) => pos(a, e) === k); }
      else if ((m = line.match(/^(.+) and (.+) live in the same house\.$/))) { const e1 = ent(m[1]), e2 = ent(m[2]); preds.push((a) => pos(a, e1) === pos(a, e2)); }
      else if ((m = line.match(/^(.+) lives directly left of (.+)\.$/))) { const e1 = ent(m[1]), e2 = ent(m[2]); preds.push((a) => pos(a, e1) + 1 === pos(a, e2)); }
      else if ((m = line.match(/^(.+) lives somewhere left of (.+)\.$/))) { const e1 = ent(m[1]), e2 = ent(m[2]); preds.push((a) => pos(a, e1) < pos(a, e2)); }
      else if ((m = line.match(/^(.+) and (.+) live next to each other\.$/))) { const e1 = ent(m[1]), e2 = ent(m[2]); preds.push((a) => Math.abs(pos(a, e1) - pos(a, e2)) === 1); }
      else return `UNPARSED: ${line}`;
    }
    const perms: string[][][] = vals.map((v) => [...permsDistinct('0123')].map((s) => s.split('').map((c) => v[Number(c)])));
    const sols: A[] = [];
    for (const x of perms[0]) for (const y of perms[1]) for (const z of perms[2]) { const a = [x, y, z]; if (preds.every((f) => f(a))) sols.push(a); }
    if (sols.length !== 1) return `NOT-UNIQUE(${sols.length})`;
    const q = ent(p.match(/is home to (.+)\? Show/)![1]);
    return `${pos(sols[0], q) + 1}`;
  },
  'reason-route-1': (p) => {
    const edges = [...p.matchAll(/The road between (\w+) and (\w+) takes (\d+) minutes/g)].map((m) => [m[1], m[2], Number(m[3])] as const);
    const m = p.match(/drive from (\w+) to (\w+)\?/)!;
    let best = Infinity;
    const dfs = (at: string, seen: Set<string>, cost: number) => {
      if (cost >= best) return;
      if (at === m[2]) { best = cost; return; }
      for (const [a, b, w] of edges) {
        const nx = a === at ? b : b === at ? a : null;
        if (nx && !seen.has(nx)) { seen.add(nx); dfs(nx, seen, cost + w); seen.delete(nx); }
      }
    };
    dfs(m[1], new Set([m[1]]), 0);
    return `${best}`;
  },
  'reason-critical-path-1': (p) => {
    const jobs = [...p.matchAll(/^- (\w+) takes (\d+) days? and (?:can start right away|can start only after (.+) (?:is|are) finished)\.$/gm)]
      .map((m) => ({ name: m[1].toLowerCase(), dur: Number(m[2]), deps: m[3] ? m[3].split(' and ').map((s) => s.toLowerCase()) : [] }));
    const doneAt = new Map<string, number>();
    const running = new Map<string, number>();
    let day = 0;
    while (doneAt.size < jobs.length && day < 1000) {
      for (const j of jobs) if (!doneAt.has(j.name) && !running.has(j.name) && j.deps.every((d) => (doneAt.get(d) ?? Infinity) <= day)) running.set(j.name, day + j.dur);
      day++;
      for (const [n, end] of running) if (end === day) { doneAt.set(n, day); running.delete(n); }
    }
    return `${Math.max(...doneAt.values())}`;
  },
  'reason-currency-chain-1': (p) => {
    const m = p.match(/change (\d+) \w+ into \w+ at ([\d.]+) \w+ per \w+\. The exchange keeps (\d+)% .* flat (\d+) \w+ handling fee\. .* at ([\d.]+) \w+ per \w+\./)!;
    const v = ((Number(m[1]) * Number(m[2]) * (1 - Number(m[3]) / 100)) - Number(m[4])) * Number(m[5]);
    const r = Math.round(v);
    return Math.abs(v - r) < 1e-6 ? `${r}` : `NONINT(${v})`;
  },
  'reason-work-rate-1': (p) => {
    const a = BigInt(num(p, /Ana paints a fence in (\d+) hours/)), b = BigInt(num(p, /Ben in (\d+) hours/)), c = BigInt(num(p, /Cal in (\d+) hours/));
    const t = BigInt(num(p, /after (\d+) minutes Cal leaves/));
    const U = 60n * a * b * c; // job size in units; Ana does b*c units/min, Ben a*c, Cal a*b
    const rem = U - t * (b * c + a * c + a * b);
    return fstr(t * (b * c + a * c) + rem, b * c + a * c);
  },
  'reason-modular-1': (p) => {
    const m = p.match(/(\d+)\^(\d+) ([+×]) (\d+)\^(\d+)/)!;
    const mod = /last two digits/.test(p) ? 100n : BigInt(num(p, /divided by (\d+)\?/));
    const pw = (b: bigint, e: bigint) => { let r = 1n; b %= mod; while (e > 0n) { if (e & 1n) r = (r * b) % mod; b = (b * b) % mod; e >>= 1n; } return r; };
    const x = pw(BigInt(m[1]), BigInt(m[2])), y = pw(BigInt(m[4]), BigInt(m[5]));
    return `${m[3] === '+' ? (x + y) % mod : (x * y) % mod}`;
  },
  'reason-average-speed-trap-1': (p) => {
    const speeds = p.includes('three stretches')
      ? p.match(/at (\d+), (\d+) and (\d+) km\/h/)!.slice(1).map(BigInt)
      : [BigInt(num(p, /Q at (\d+) km\/h/)), BigInt(num(p, /back along the same route at (\d+) km\/h/))];
    const D = speeds.reduce((x, v) => x * v, 1n); // leg length that makes every leg time whole
    const time = speeds.reduce((s, v) => s + D / v, 0n);
    return fstr(BigInt(speeds.length) * D, time);
  },
  'reason-venn-1': (p) => {
    const m = p.match(/survey of (\d+) people.*?(\d+) like \w+, (\d+) like \w+ and (\d+) like \w+\. (\d+) like both .*?, (\d+) like both .*?, and (\d+) like both .*?\. (\d+) like none/s)!;
    const [N, X, Y, Z, XY, XZ, YZ, none] = m.slice(1).map(Number);
    const fits: number[] = [];
    for (let t = 0; t <= Math.min(XY, XZ, YZ); t++) {
      const xy = XY - t, xz = XZ - t, yz = YZ - t;
      const x = X - xy - xz - t, y = Y - xy - yz - t, z = Z - xz - yz - t;
      if ([x, y, z].every((v) => v >= 0) && x + y + z + xy + xz + yz + t + none === N) fits.push(t);
    }
    return fits.length === 1 ? `${fits[0]}` : `AMBIGUOUS(${fits.join(',')})`;
  },
};

// ── reason ─────────────────────────────────────────────────────────────────────
check('12 reason tasks', REASON_TASKS.length === 12, `${REASON_TASKS.length}`);
for (const t of REASON_TASKS) {
  const solve = solvers[t.id];
  check(`${t.id}: has an independent solver`, !!solve);
  if (!solve) continue;
  const prompts = new Set<string>();
  for (let i = 0; i < 500; i++) prompts.add(promptOf(t, `d${i}`).p);
  check(`${t.id}: >= 300 distinct prompts / 500`, prompts.size >= 300, `${prompts.size}`);
  console.log(`      ${t.id.padEnd(30)} distinct ${prompts.size}/500`);
  for (let i = 0; i < 24; i++) {
    const { inst, p } = promptOf(t, `v${i}`);
    const ans = solve(p);
    const ok = inst.grade(resp(`Working...\nFinal: ${ans}`), ctx) as { score: number; detail: string };
    check(`${t.id} [v${i}]: independent answer ${ans} passes`, ok.score === 1, ok.detail);
    const wrong = /^-?\d+$/.test(ans) ? `${Number(ans) + 1}` : ans.replace(/^(-?\d+)/, (x) => `${Number(x) + 1}`);
    const bad = inst.grade(resp(`Working...\nFinal: ${wrong}`), ctx) as { score: number };
    check(`${t.id} [v${i}]: wrong answer fails`, bad.score === 0);
    const noLine = inst.grade(resp(`The answer is ${ans}`), ctx) as { score: number };
    check(`${t.id} [v${i}]: missing Final line fails`, noLine.score === 0);
  }
}

// equivalent exact forms are accepted, inexact ones are not
{
  const t = byId(REASON_TASKS, 'reason-average-speed-trap-1');
  const { inst, p } = promptOf(t, 'v0');
  const ans = solvers[t.id](p);
  const [n, d] = ans.includes('/') ? ans.split('/').map(Number) : [Number(ans), 1];
  check('unreduced fraction accepted', (inst.grade(resp(`Final: ${n * 3}/${d * 3}`), ctx) as { score: number }).score === 1);
  check('rounded decimal rejected', d === 1 || (inst.grade(resp(`Final: ${(n / d).toFixed(2)}`), ctx) as { score: number }).score === 0);
}

// ── instruct ───────────────────────────────────────────────────────────────────
const filler = (n: number, w = 'steady') => Array(Math.max(0, n)).fill(w).join(' ');

const builders: Record<string, (p: string) => { good: string; bad: string }> = {
  'instruct-product-copy-1': (p) => {
    const bullets = num(p, /Exactly (\d+) bullet/);
    const upper = p.match(/The word (\w+) appears/)![1];
    const sku = p.match(/last line is exactly "([^"]+)"/)![1];
    const ls = Array.from({ length: bullets }, (_, i) => (i === 0 ? `- Built to stay ${upper} for years` : `- Solid choice number ${'x'.repeat(i)}`));
    return { good: [...ls, sku].join('\n'), bad: ['Here you go:', ...ls, sku].join('\n') };
  },
  'instruct-json-schema-1': (p) => {
    const id = p.match(/"id": the string "([^"]+)"/)![1];
    const lo = num(p, /integer from (\d+) to/);
    const n = num(p, /exactly (\d+) different lowercase/);
    const stock = /the boolean true/.test(p);
    const obj = { id, name: 'Blue Canvas Tent', quantity: lo, tags: Array.from({ length: n }, (_, i) => `tag${'abcdef'[i]}`), in_stock: stock };
    return { good: JSON.stringify(obj, null, 2), bad: '```json\n' + JSON.stringify(obj) + '\n```' };
  },
  'instruct-lowercase-range-1': (p) => {
    const lo = num(p, /Between (\d+) and/);
    const kw = p.match(/Use the word "(\w+)"/)![1];
    const k = num(p, /at least (\d+) times/);
    const end = p.match(/exact phrase "([^"]+)"/)![1];
    const body = [...Array(k).fill(kw), filler(lo - k - end.split(' ').length + 1), end].join(' ') + '.';
    return { good: body, bad: body[0].toUpperCase() + body.slice(1) };
  },
  'instruct-numbered-list-1': (p) => {
    const n = num(p, /exactly (\d+) lines/);
    const j = num(p, /Item (\d+) must contain/);
    const w = p.match(/must contain the word "(\w+)"/)![1];
    const items = Array.from({ length: n }, (_, i) => `${i + 1}. ${i + 1 === j ? `keep a ${w} nearby` : 'start with small steps'}`);
    const bad = [...items];
    bad[0] = '1. The first step matters';
    return { good: items.join('\n'), bad: bad.join('\n') };
  },
  'instruct-sections-1': (p) => {
    const heads = [...p.matchAll(/"## ([^"]+)"/g)].map((m) => m[1]);
    const phrase = p.match(/Include the phrase (.+?) wrapped/)![1];
    const body = `## ${heads[0]}\nWe keep it simple: "${phrase}".\n## ${heads[1]}\nCosts stay low.\n## ${heads[2]}\nReview next month.`;
    return { good: body, bad: `# Brief\n${body}` };
  },
  'instruct-paragraphs-1': (p) => {
    const n = num(p, /Exactly (\d+) paragraphs/);
    const k = num(p, /Paragraph (\d+) must start/);
    const first = p.match(/start with the word "(\w+)"/)![1];
    const lo = num(p, /between (\d+) and \d+ words/);
    const banned = p.match(/Do not use the word "(\w+)"/)![1];
    const paras = Array.from({ length: n }, (_, i) => `${i + 1 === k ? first : 'Today'} ${filler(lo - 1)}.`);
    const bad = [...paras];
    bad[0] = bad[0].replace('steady', banned);
    return { good: paras.join('\n***\n'), bad: bad.join('\n***\n') };
  },
  'instruct-repeat-request-1': (p) => {
    const request = p.split('\n\n')[1];
    const kw = request.match(/using the word (\w+) at least twice/)![1];
    const close = request.match(/end with "([^"]+)"$/)![1];
    const good = `${request}\n\nA good ${kw} builds over time, and each ${kw} saves effort later. ${close}`;
    return { good, bad: `Sure! ${good}` };
  },
  'instruct-csv-1': (p) => {
    const header = p.match(/first line is exactly: (\S+)/)![1];
    const n = num(p, /exactly (\d+) data rows/);
    const lo = num(p, /integer from (\d+) to/);
    const rows = Array.from({ length: n }, (_, i) => `key${'abcdefgh'[i]},${lo + i},north`);
    return { good: [header, ...rows].join('\n'), bad: [header, ...[...rows].reverse()].join('\n') };
  },
  'instruct-uppercase-notice-1': (p) => {
    const kw = p.match(/Use the word (\w+) at least/)![1];
    const k = num(p, /at least (\d+) times/);
    const lo = num(p, /Between (\d+) and/);
    const text = `<<BUILDING ${kw}>>\n${Array(k).fill(kw).join(' ')} ${filler(lo - k - 2, 'STEADY')}.`;
    return { good: text, bad: `${text}!` };
  },
  'instruct-postscript-1': (p) => {
    const n = num(p, /Exactly (\d+) bullet/);
    const h = num(p, /at least (\d+) phrases/);
    const bl = Array.from({ length: n }, (_, i) => `* ${i < h ? 'remember *this part*' : 'keep going'}`);
    const good = [...bl, 'P.S. See you soon.'].join('\n');
    return { good, bad: [...bl, 'P.S. See you at 5.'].join('\n') };
  },
};

check('10 instruct tasks', INSTRUCT_TASKS.length === 10, `${INSTRUCT_TASKS.length}`);
for (const t of INSTRUCT_TASKS) {
  const build = builders[t.id];
  check(`${t.id}: has a builder`, !!build);
  if (!build) continue;
  for (let i = 0; i < 8; i++) {
    const { inst, p } = promptOf(t, `i${i}`);
    const { good, bad } = build(p);
    const g = inst.grade(resp(good), ctx) as { score: number; detail: string };
    const b = inst.grade(resp(bad), ctx) as { score: number; detail: string };
    check(`${t.id} [i${i}]: compliant answer scores 1`, g.score === 1, `${g.detail}\n${good}`);
    check(`${t.id} [i${i}]: violation scores < 1`, b.score < 1, b.detail);
  }
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nall ${passes} reason/instruct checks passed`);
process.exit(failures ? 1 : 0);
