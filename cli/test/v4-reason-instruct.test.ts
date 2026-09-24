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
const utc = (s: string) => { const m = s.trim().match(/^(\w+) (\d+), (\d+)$/)!; return Date.UTC(Number(m[3]), MONTHS.indexOf(m[1]), Number(m[2])); };
const DAY = 86400000;

// Exact rationals for solvers that need them.
type Q = [bigint, bigint];
const qn = ([n, d]: Q): Q => { if (d < 0n) { n = -n; d = -d; } const g = bgcd(n, d) || 1n; return [n / g, d / g]; };
const qadd = (x: Q, y: Q): Q => qn([x[0] * y[1] + y[0] * x[1], x[1] * y[1]]);
const qsub = (x: Q, y: Q): Q => qadd(x, [-y[0], y[1]]);
const qmul = (x: Q, y: Q): Q => qn([x[0] * y[0], x[1] * y[1]]);
const qdiv = (x: Q, y: Q): Q => qn([x[0] * y[1], x[1] * y[0]]);
const qs = (x: Q) => fstr(x[0], x[1]);
const Qi = (n: number | bigint): Q => [BigInt(n), 1n];

const solvers: Record<string, (p: string) => string> = {
  'reason-tank-phases-1': (p) => {
    const cap = num(p, /A (\d+)-litre/), start = num(p, /already holds (\d+) litres/);
    const a = num(p, /empty tank in (\d+) minutes/), b = num(p, /pipe B in (\d+) minutes/), c = num(p, /pipe C in (\d+) minutes/);
    const d = num(p, /removes (\d+) litres/), t1 = num(p, /At minute (\d+) pipe A breaks/), t2 = num(p, /At minute (\d+) pipe C/), t3 = num(p, /At minute (\d+) the drain/);
    // Walk the timeline segment by segment with exact rates.
    const events = [0, t1, t2, t3];
    const rate = (i: number): Q => {
      let r: Q = Qi(0);
      if (i < 1) r = qadd(r, [BigInt(cap), BigInt(a)]);
      r = qadd(r, [BigInt(cap), BigInt(b)]);
      if (i >= 2) r = qadd(r, [BigInt(cap), BigInt(c)]);
      if (i < 3) r = qsub(r, Qi(d));
      return r;
    };
    let vol: Q = Qi(start);
    for (let i = 0; i < 4; i++) {
      const r = rate(i);
      const segEnd = i < 3 ? events[i + 1] : Infinity;
      if (r[0] > 0n) {
        const need = qdiv(qsub(Qi(cap), vol), r);
        const at = qadd(Qi(events[i]), need);
        if (segEnd === Infinity || at[0] <= BigInt(segEnd) * at[1]) return qs(at);
      }
      if (segEnd !== Infinity) vol = qadd(vol, qmul(r, Qi(segEnd - events[i])));
    }
    return 'NEVER';
  },
  'reason-prob-draw-1': (p) => {
    const m = p.match(/holds (\d+) (\w+), (\d+) (\w+), (\d+) (\w+), (\d+) (\w+) \w+\. You draw (\d+) at random.*at least one of the drawn items is (\w+) and that at most one is (\w+)\..*exactly (\d+) of the drawn items are (\w+)\?/)!;
    const balls: string[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < Number(m[1 + 2 * i]); j++) balls.push(m[2 + 2 * i]);
    const all = combos(balls.map((c, i) => ({ c, i })), Number(m[9]))
      .filter((cm) => cm.some((x) => x.c === m[10]) && cm.filter((x) => x.c === m[11]).length <= 1);
    const hit = all.filter((cm) => cm.filter((x) => x.c === m[13]).length === Number(m[12])).length;
    return fstr(BigInt(hit), BigInt(all.length));
  },
  'reason-count-arrange-1': (p) => {
    const m = p.match(/string "(\w+)" have no two (\w)'s next to each other, no two (\w)'s next to each other and no two (\w)'s/)!;
    let n = 0;
    for (const s of permsDistinct(m[1])) if (!s.includes(m[2] + m[2]) && !s.includes(m[3] + m[3]) && !s.includes(m[4] + m[4])) n++;
    return `${n}`;
  },
  'reason-weekday-count-1': (p) => {
    const m = p.match(/^(\w+ \d+, \d+) is a (\w+)\./)!;
    const start = utc(m[1]);
    if (DAYS_SUN0[new Date(start).getUTCDay()] !== m[2]) return 'STATED-WEEKDAY-WRONG';
    const hols = p.match(/Its holidays are: ([^.]+)\./)![1].split('; ').map(utc);
    const end = utc(p.match(/through (\w+ \d+, \d+), counting/)![1]);
    const observed = new Set(hols.map((h) => { const w = new Date(h).getUTCDay(); return w === 6 ? h - DAY : w === 0 ? h + DAY : h; }));
    const lastFriday = (t: number) => {
      const dt = new Date(t);
      if (dt.getUTCDay() !== 5) return false;
      return new Date(t + 7 * DAY).getUTCMonth() !== dt.getUTCMonth();
    };
    let n = 0;
    for (let t = start; t <= end; t += DAY) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6 && !observed.has(t) && !lastFriday(t)) n++; }
    return `${n}`;
  },
  'reason-logic-grid-1': (p) => {
    const seats = [...p.matchAll(/(\w+) \(seat (\d+)\)/g)].map((m) => [m[1], Number(m[2])] as const);
    const idx = new Map(seats.map(([nm, s]) => [nm, s - 1]));
    const n = seats.length;
    const said = [...p.matchAll(/^- (\w+): "(.+)"$/gm)].map((m) => ({ who: idx.get(m[1])!, text: m[2] }));
    const evalStmt = (t: string, k: boolean[]): boolean => {
      let m: RegExpMatchArray | null;
      if ((m = t.match(/^(\w+) is a (knight|knave)\.$/))) return k[idx.get(m[1])!] === (m[2] === 'knight');
      if ((m = t.match(/^Exactly (\d+) of (.+) (?:is a knave|are knaves)\.$/))) {
        const grp = m[2].split(', ').map((x) => idx.get(x)!);
        return grp.filter((i) => !k[i]).length === Number(m[1]);
      }
      if ((m = t.match(/^(\w+) and (\w+) are (the same kind|different kinds)\.$/))) return (k[idx.get(m[1])!] === k[idx.get(m[2])!]) === (m[3] === 'the same kind');
      if ((m = t.match(/^At least (\d+) of the \d+ of us are knights\.$/))) return k.filter(Boolean).length >= Number(m[1]);
      if ((m = t.match(/^If (\w+) is a knight, then (\w+) is a knave\.$/))) return !k[idx.get(m[1])!] || !k[idx.get(m[2])!];
      throw new Error(`UNPARSED ${t}`);
    };
    const fits: boolean[][] = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      const k = Array.from({ length: n }, (_, i) => !!(mask & (1 << i)));
      if (said.every(({ who, text }) => evalStmt(text, k) === k[who])) fits.push(k);
    }
    if (fits.length !== 1) return `NOT-UNIQUE(${fits.length})`;
    const kn = fits[0].map((v, i) => (v ? i + 1 : 0)).filter(Boolean);
    return `${100 * kn.length + kn.reduce((x, y) => x + y, 0)}`;
  },
  'reason-route-1': (p) => {
    const edges = [...p.matchAll(/The road between (\w+) and (\w+) takes (\d+) minutes/g)].map((m) => [m[1], m[2], Number(m[3])] as const);
    const closedList = p.match(/Today these roads are closed: between (.+?)\. You must/)![1].split('; between ').map((x) => x.split(' and '));
    const closed = (a: string, b: string) => closedList.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    const m = p.match(/drive from (\w+) to (\w+) and stop in both (\w+) and (\w+) on the way/)!;
    const nodes = [...new Set(edges.flatMap(([a, b]) => [a, b]))];
    const ix = new Map(nodes.map((nd, i) => [nd, i]));
    const D = nodes.map((_, i) => nodes.map((__, j) => (i === j ? 0 : Infinity)));
    for (const [a, b, w] of edges) if (!closed(a, b)) { const i = ix.get(a)!, j = ix.get(b)!; D[i][j] = Math.min(D[i][j], w); D[j][i] = Math.min(D[j][i], w); }
    for (let k = 0; k < nodes.length; k++) for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
    const g = (x: string, y: string) => D[ix.get(x)!][ix.get(y)!];
    return `${Math.min(g(m[1], m[3]) + g(m[3], m[4]) + g(m[4], m[2]), g(m[1], m[4]) + g(m[4], m[3]) + g(m[3], m[2]))}`;
  },
  'reason-critical-path-1': (p) => {
    const jobs = [...p.matchAll(/^- (\w+) \((\d+) days?\) needs: (.+?)\.(?: It cannot start before day (\d+)\.)?$/gm)].map((m) => ({
      name: m[1].toLowerCase(), dur: Number(m[2]), release: m[4] ? Number(m[4]) : 0,
      deps: m[3] === 'nothing' ? [] : m[3].split(', ').map((d) => { const w = d.match(/^(\w+)(?: \+(\d+) days wait)?$/)!; return { name: w[1], wait: w[2] ? Number(w[2]) : 0 }; }),
    }));
    // Day-by-day: free crews that finished, then start ready jobs by the stated rule.
    const doneAt = new Map<string, number>();
    const running = new Map<string, number>();
    for (let day = 0; day < 3000; day++) {
      for (const [nm, end] of [...running]) if (end === day) { doneAt.set(nm, day); running.delete(nm); }
      if (doneAt.size === jobs.length) return `${Math.max(...doneAt.values())}`;
      const ready = jobs.filter((j) => !doneAt.has(j.name) && !running.has(j.name) && day >= j.release
        && j.deps.every((d) => doneAt.has(d.name) && doneAt.get(d.name)! + d.wait <= day))
        .sort((x, y) => y.dur - x.dur || (x.name < y.name ? -1 : 1));
      while (running.size < 2 && ready.length) { const j = ready.shift()!; running.set(j.name, day + j.dur); }
    }
    return 'STUCK';
  },
  'reason-currency-chain-1': (p) => {
    const rates = [...p.matchAll(/^- 1 (\w+) buys ([\d.]+) (\w+)(?:, with a (\d+)% fee.*|, no fee)\.$/gm)].map((m) => {
      const [w, f = ''] = m[2].split('.');
      return { a: m[1], b: m[3], n: BigInt(w + f), d: 10n ** BigInt(f.length), keep: BigInt(100 - Number(m[4] ?? 0)) };
    });
    const m = p.match(/You have (\d+) (\w+) and want as many (\w+) as possible/)!;
    let bn = -1n, bd = 1n;
    const dfs = (at: string, n: bigint, d: bigint, seen: string[]) => {
      if (at === m[3]) { if (n * bd > bn * d) { bn = n; bd = d; } return; }
      if (seen.length > 4) return;
      for (const r of rates) if (r.a === at && !seen.includes(r.b)) dfs(r.b, n * r.n * r.keep, d * r.d * 100n, [...seen, r.b]);
    };
    dfs(m[2], BigInt(m[1]), 1n, [m[2]]);
    return fstr(bn, bd);
  },
  'reason-work-rate-1': (p) => {
    const hrs = (who: string) => BigInt(num(p, new RegExp(`${who}(?: paints a fence)? in (\\d+) hours`)));
    const [a, b, c, d] = ['Ana', 'Ben', 'Cal', 'Dee'].map(hrs);
    const t1 = num(p, /Cal leaves for good at minute (\d+)/);
    const bs = num(p, /break from minute (\d+)/), be = num(p, /break from minute \d+ to minute (\d+)/);
    const t2 = num(p, /Dee arrives at minute (\d+)/);
    // Exact event integration in fractions of the job.
    const r = (h: bigint): Q => [1n, 60n * h];
    const pts = [...new Set([0, t1, bs, be, t2])].sort((x, y) => x - y);
    const rateOn = (t: number): Q => {
      let q: Q = Qi(0);
      if (!(t >= bs && t < be)) q = qadd(q, r(a));
      q = qadd(q, r(b));
      if (t < t1) q = qadd(q, r(c));
      if (t >= t2) q = qadd(q, r(d));
      return q;
    };
    let done: Q = Qi(0);
    for (let i = 0; i < pts.length; i++) {
      const from = pts[i], to = i + 1 < pts.length ? pts[i + 1] : Infinity;
      const q = rateOn(from);
      const need = qdiv(qsub(Qi(1), done), q);
      const at = qadd(Qi(from), need);
      if (to === Infinity || at[0] <= BigInt(to) * at[1]) return qs(at);
      done = qadd(done, qmul(q, Qi(to - from)));
    }
    return 'NEVER';
  },
  'reason-modular-1': (p) => {
    const lo = num(p, /with (\d+) ≤ n/), hi = num(p, /≤ n ≤ (\d+)/);
    const ds = p.match(/of the four numbers ([\d, ]+)\?/)![1].split(', ').map(Number);
    let n = 0;
    for (let x = lo; x <= hi; x++) if (ds.filter((dv) => x % dv === 0).length === 2) n++;
    return `${n}`;
  },
  'reason-average-speed-trap-1': (p) => {
    const D = BigInt(num(p, /makes a (\d+) km trip/));
    const v1 = BigInt(num(p, /first stretch at a steady (\d+) km\/h/));
    const v2 = BigInt(num(p, /it moves at (\d+) km\/h and for/)), v3 = BigInt(num(p, /other half of that time at (\d+) km\/h/));
    const stop = BigInt(num(p, /stops for (\d+) minutes/)), v4 = BigInt(num(p, /last stretch at a steady (\d+) km\/h/));
    // Work in minutes: a third is D/3 km.
    const third: Q = [D, 3n];
    let mins: Q = qmul(qdiv(third, Qi(v1)), Qi(60));
    mins = qadd(mins, qmul(qdiv(qmul(third, Qi(2)), Qi(v2 + v3)), Qi(60)));
    mins = qadd(mins, qmul(qdiv(third, Qi(v4)), Qi(60)));
    mins = qadd(mins, Qi(stop));
    return qs(qdiv(Qi(D * 60n), mins));
  },
  'reason-venn-1': (p) => {
    const N = num(p, /survey of (\d+) people/);
    const S1 = [...p.matchAll(/(\d+) like (?!both|all|none)\w+[,.]/g)].map((m) => Number(m[1]));
    const S2 = num(p, /add the six counts, you get (\d+)/), L3 = num(p, /(\d+) people like at least three/), L4 = num(p, /(\d+) like all four/);
    // e_k = people in exactly k sets. S1 = Σ k·e_k ; S2 = Σ C(k,2)·e_k.
    const e4 = L4, e3 = L3 - L4;
    const e2 = S2 - 3 * e3 - 6 * e4;
    const e1 = S1.reduce((x, y) => x + y, 0) - 2 * e2 - 3 * e3 - 4 * e4;
    return S1.length === 4 ? `${N - e1 - e2 - e3 - e4}` : `PARSE(${S1.length})`;
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
// Each instance carries `spec` (its drawn values). A compliant answer is built
// from the spec, and one deliberate violation must lower the score.
type Spec = Record<string, any>;
const specOf = (t: V4Task, seed: string) => {
  const inst = t.build(taskRng(seed, t.id)) as SingleInstance & { spec: Spec };
  return { inst, s: inst.spec };
};
const fill = (n: number, w = 'steady') => Array.from({ length: Math.max(0, n) }, () => w);
const abc = (n: number, upper = false) => { const x = 'abcdfghijklmnopqrstuvwxyz'.repeat(3).slice(0, n); return upper ? x.toUpperCase() : x; };
const centsStr = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

const builders: Record<string, (s: Spec) => { good: string; bad: string }> = {
  'instruct-product-copy-1': (s) => {
    const bl = [...s.acro].map((L: string, i: number) => {
      const ws = [`${L}olid`, ...fill(s.W - 1)];
      if (i === s.k - 1) ws[1] = s.upper;
      const others = ws.slice(0, -1).join('').replace(/[^A-Za-z]/g, '').length;
      ws[ws.length - 1] = abc(s.C - others);
      return `- ${ws.join(' ')}`;
    });
    const bad = [...bl];
    bad[bad.length - 1] += '.';
    return { good: [...bl, s.sku].join('\n'), bad: [...bad, s.sku].join('\n') };
  },
  'instruct-json-schema-1': (s) => {
    const obj = {
      id: s.id, name: ['Blue', 'Canvas', 'Tent', 'Pole'].slice(0, s.nameWords).join(' '), dimensions: s.dims,
      tags: Array.from({ length: s.nTags }, (_, i) => 'abcdefghijklmnopqrstuvwxyz'.slice(i * s.L, (i + 1) * s.L)), in_stock: s.stock, notes: null,
    };
    return { good: JSON.stringify(obj), bad: JSON.stringify(obj, null, 1) };
  },
  'instruct-lowercase-range-1': (s) => {
    const T = s.lo + 2;
    const base = Math.floor(T / s.S);
    const counts = Array.from({ length: s.S }, (_, i) => base + (i < T - base * s.S ? 1 : 0));
    const e0 = s.end.split(' ').length;
    const sents = counts.map((c0: number, i: number) => {
      const c = i === s.S - 1 ? Math.max(c0, e0) : c0; // the ending phrase must fit; total slack covers it
      const ws = fill(c, 'solid');
      if (i === 0) for (let x = 0; x < s.k; x++) ws[x] = s.kw;
      if (i === s.j - 1) ws[2] = s.X;
      if (i === s.S - 1) { const e = s.end.split(' '); ws.splice(c - e.length, e.length, ...e); }
      return `${ws.join(' ')}.`;
    });
    const good = sents.join(' ');
    return { good, bad: good.replace('solid ', 'solid, ') };
  },
  'instruct-numbered-list-1': (s) => {
    const items = Array.from({ length: s.n }, (_, i) => {
      const ws = [s.FIRSTS[i], ...fill(s.W - 1)];
      if (i === s.j - 1) ws[1] = s.w;
      const others = ws.slice(0, -1).join(' ').length + 1; // + the space before the last word
      ws[ws.length - 1] = abc(s.C - others - 1); // - the final period
      return `${ws.join(' ')}.`;
    });
    const bad = [...items];
    [bad[0], bad[1]] = [bad[1], bad[0]];
    const fmt = (xs: string[]) => xs.map((b, i) => `${i + 1}. ${b}`).join('\n');
    return { good: fmt(items), bad: fmt(bad) };
  },
  'instruct-sections-1': (s) => {
    const sec = (i: number) => Array.from({ length: s.P }, (_, x) => {
      if (i === 1 && x === 0) return `We say "${s.phrase}" often.`;
      if (i === 2 && x === s.P - 1) return 'Is it steady enough?';
      if (i === 0) return `${['We', ...fill(s.N1 - 1)].join(' ')}.`;
      return 'We keep it steady.';
    }).join(' ');
    const good = s.heads.map((h: string, i: number) => `## ${h}\n${sec(i)}`).join('\n');
    return { good, bad: `Intro line first.\n${good}` };
  },
  'instruct-paragraphs-1': (s) => {
    const paras = Array.from({ length: s.n }, (_, i) => Array.from({ length: s.S }, (_, x) => {
      const ws = fill(4 + i);
      if (x === 0) { ws[0] = i === s.k - 1 ? s.first : 'Today'; ws[1] = s.kw; }
      if (i === 1) { ws[ws.length - 1] = `link${x}`; if (x > 0) ws[0] = `link${x - 1}`; }
      const last = i === s.n - 1 && x === s.S - 1;
      return `${ws.join(' ')}${last ? '?' : '.'}`;
    }).join(' '));
    const bad = [...paras];
    bad[0] = bad[0].replace(` ${s.kw} `, ' steady ');
    return { good: paras.join('\n***\n'), bad: bad.join('\n***\n') };
  },
  'instruct-repeat-request-1': (s) => {
    const answer = [`A little ${s.kw} goes far.`, `Each ${s.kw} step is extraordinary.`, ...fill(s.S - 3, 'Try it soon.'), s.close].join(' ');
    const good = `${s.request}\n\n${answer}`;
    return { good, bad: `Sure!\n${good}` };
  },
  'instruct-csv-1': (s) => {
    const rows = s.qtys.map((q: number, i: number) => {
      const c = s.prices[i];
      return { item: 'abcdef'[i].repeat(s.L), q, c, t: q * c };
    }).sort((a: any, b: any) => b.t - a.t || (a.item < b.item ? -1 : 1));
    const ls = rows.map((r: any) => `${r.item},${r.q},${centsStr(r.c)},${centsStr(r.t)},north`);
    const good = [s.header, ...ls].join('\n');
    const rev = [...ls].reverse();
    const bad = [s.header, ...(rev.join() === ls.join() ? ls.map((l: string) => l.replace(',north', ',"north"')) : rev)].join('\n');
    return { good, bad };
  },
  'instruct-uppercase-notice-1': (s) => {
    const extra = s.kw === 'NOTICE' ? 1 : 0;
    const body = [...s.acro].map((L: string, i: number) => {
      const last = i === s.acro.length - 1;
      const ws = [`${L}OLID`, ...fill(s.a - 1, 'STEADY')];
      if (last) ws.splice(s.a - 3, 3, 'END', 'OF', 'NOTICE');
      else if (i < s.k - extra) ws[1] = s.kw;
      const rest = ws.slice(1).join(' ').length + 1;
      ws[0] = L + abc(s.C - rest - 1, true);
      return ws.join(' ');
    });
    const title = `<<${fill(s.T, 'BUILDING').join(' ')}>>`;
    const bad = [...body];
    bad[0] += '!';
    return { good: [title, ...body].join('\n'), bad: [title, ...bad].join('\n') };
  },
  'instruct-postscript-1': (s) => {
    const bl = Array.from({ length: s.N }, (_, i) => {
      const hl = i < s.h;
      const core = i % 2 === 0 ? ['Will', 'you', 'try', ...(hl ? ['*keep', 'going*'] : ['this'])] : ['Take', 'it', ...(hl ? ['*one', 'step*'] : ['slow'])];
      const ws = [...core, ...fill(s.W - core.length - 1, 'now'), i % 2 === 0 ? 'soon?' : 'today.'];
      return `* ${ws.join(' ')}`;
    });
    return { good: [...bl, 'P.S. See you soon.'].join('\n'), bad: [...bl, 'P.S. See you at 5.'].join('\n') };
  },
};

const ALL_OR_NOTHING = new Set(['instruct-repeat-request-1', 'instruct-postscript-1']);
check('10 instruct tasks', INSTRUCT_TASKS.length === 10, `${INSTRUCT_TASKS.length}`);
for (const t of INSTRUCT_TASKS) {
  const build = builders[t.id];
  check(`${t.id}: has a builder`, !!build);
  if (!build) continue;
  const prompts = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const { inst, s } = specOf(t, `i${i}`);
    prompts.add(JSON.stringify(inst.messages));
    const { good, bad } = build(s);
    const g = inst.grade(resp(good), ctx) as { score: number; detail: string };
    const b = inst.grade(resp(bad), ctx) as { score: number; detail: string };
    check(`${t.id} [i${i}]: compliant answer scores 1`, g.score === 1, `${g.detail}\n${good}`);
    check(`${t.id} [i${i}]: violation scores < 1`, b.score < 1, `${b.detail}\n${bad}`);
    if (ALL_OR_NOTHING.has(t.id)) check(`${t.id} [i${i}]: all-or-nothing gives 0`, b.score === 0, b.detail);
    else check(`${t.id} [i${i}]: one violation costs one rule, not everything`, b.score > 0, b.detail);
    check(`${t.id} [i${i}]: empty reply scores low`, (inst.grade(resp(''), ctx) as { score: number }).score < 0.5);
  }
  check(`${t.id}: prompts vary across seeds`, prompts.size >= 8, `${prompts.size}/12`);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nall ${passes} reason/instruct checks passed`);
process.exit(failures ? 1 : 0);
