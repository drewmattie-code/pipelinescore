import type { Grade, Rng, V4Task } from '../types.js';
import { finalLine } from '../util.js';

// Every reasoning task is a template: values are drawn per seed by rejection
// sampling until the answer is clean, and the answer comes from a solver, never
// from a stored key.

const INT_FORMAT = 'Show your working, then end with a last line of exactly "Final: <integer>" and nothing after it.';
const FRAC_FORMAT =
  'Show your working, then end with a last line of exactly "Final: <a>/<b>" giving the exact value as a fraction in lowest terms (write a plain integer if it is whole), and nothing after it.';

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : Math.abs(x));

export interface Frac { n: number; d: number }

export function frac(n: number, d = 1): Frac {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(Math.abs(n), d) || 1;
  return { n: n / g, d: d / g };
}

export function fracStr(f: Frac): string {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;
}

// Reads "Final: 7/12", "Final: 136", "Final: 0.5" (exact decimals only).
export function parseFinal(text: string): Frac | null {
  const m = finalLine(text).replace(/\*/g, '').match(/^Final:\s*\$?\s*(-?[\d,]*\.?\d+)\s*(?:\/\s*(-?\d[\d,]*))?\s*\.?$/i);
  if (!m) return null;
  const a = m[1].replace(/,/g, '');
  let n: number;
  let d: number;
  if (a.includes('.')) {
    const [w, f] = a.split('.');
    d = 10 ** f.length;
    n = Number(w || '0') * d + (a.startsWith('-') ? -1 : 1) * Number(f);
  } else {
    n = Number(a);
    d = 1;
  }
  if (m[2]) d *= Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return frac(n, d);
}

function gradeExact(text: string, want: Frac): Grade {
  const got = parseFinal(text);
  if (got && got.n === want.n && got.d === want.d) return { score: 1, detail: `Final: ${fracStr(got)}` };
  return { score: 0, detail: `want ${fracStr(want)}, got ${got ? fracStr(got) : `"${finalLine(text).slice(0, 60)}"`}` };
}

function single(content: string, want: Frac) {
  return {
    kind: 'single' as const,
    messages: [{ role: 'user' as const, content }],
    grade: (res: { text: string }) => gradeExact(res.text, want),
  };
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

// ── 1. tank with a mid-way pipe failure ──────────────────────────────────────
function drawTank(rng: Rng) {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const a = rng.int(12, 40);
    const b = rng.int(a + 10, 120);
    const lcm = (a * b) / gcd(a, b);
    if (lcm > 3000) continue;
    const cap = lcm * rng.int(1, 3);
    const ra = cap / a;
    const rb = cap / b;
    if (rb < 2) continue;
    const drain = rng.int(1, rb - 1);
    const r1 = ra + rb - drain;
    const t1Max = Math.floor(cap / r1) - 1;
    if (t1Max < 2) continue;
    const t1 = rng.int(2, t1Max);
    const rem = cap - t1 * r1;
    if (rem <= 0 || rem % (rb - drain) !== 0) continue;
    return { cap, a, b, drain, t1, answer: rem / (rb - drain) };
  }
  throw new Error('reason-tank: no integer instance found');
}

export const reasonTank: V4Task = {
  id: 'reason-tank-phases-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const { cap, a, b, drain, t1, answer } = drawTank(rng);
    return single(
      `A ${cap}-litre tank starts empty. Pipe A alone fills it in ${a} minutes; pipe B alone fills it in ${b} minutes. ` +
        `A drain removes ${drain} litres per minute whenever it is open. All three start together. After ${t1} minutes pipe A breaks and stops for good, ` +
        `while B and the drain keep running. How many more minutes until the tank is full? ${INT_FORMAT}`,
      frac(answer),
    );
  },
};

// ── 2. hypergeometric probability ─────────────────────────────────────────────
const COLOURS = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'orange', 'purple'];
const OBJECTS = ['marbles', 'socks', 'tokens', 'beads', 'tickets', 'dice'];

export const reasonProbDraw: V4Task = {
  id: 'reason-prob-draw-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    const cols = rng.shuffle(COLOURS).slice(0, 3);
    const counts = [rng.int(2, 7), rng.int(2, 7), rng.int(2, 7)];
    const n = counts[0] + counts[1] + counts[2];
    const k = rng.int(3, 5);
    const ask = rng.int(0, 2);
    const j = rng.int(1, Math.min(k, counts[ask]));
    const p = frac(choose(counts[ask], j) * choose(n - counts[ask], k - j), choose(n, k));
    return single(
      `A bag holds ${counts[0]} ${cols[0]}, ${counts[1]} ${cols[1]} and ${counts[2]} ${cols[2]} ${rng.pick(OBJECTS)}. ` +
        `You draw ${k} at random without replacement. What is the probability that exactly ${j} of them are ${cols[ask]}? ${FRAC_FORMAT}`,
      p,
    );
  },
};

// ── 3. arrangements with no two copies adjacent ───────────────────────────────
export function multisetPerms(counts: number[]): number {
  let r = 1;
  let used = 0;
  for (const c of counts) { used += c; r *= choose(used, c); }
  return r;
}

export const reasonArrangements: V4Task = {
  id: 'reason-count-arrange-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const letters = rng.shuffle('BCDEFGHKLMNPRSTW'.split(''));
    const target = letters[0];
    const a = rng.int(2, 3);
    const others: string[] = [];
    const m = rng.int(8 - a - 2, 8 - a); // total length 6..8
    const pool = letters.slice(1, 1 + rng.int(2, 4));
    for (let i = 0; i < m; i++) others.push(rng.pick(pool));
    const word = rng.shuffle([...Array(a).fill(target), ...others]).join('');
    const counts = pool.map((l) => others.filter((x) => x === l).length).filter((c) => c > 0);
    // Arrange the other letters, then drop the copies of the target into distinct gaps.
    const answer = multisetPerms(counts) * choose(m + 1, a);
    return single(
      `How many distinct arrangements of the letters of the string "${word}" have no two ${target}'s next to each other? ` +
        `(Arrangements that read the same letter-for-letter count once.) ${INT_FORMAT}`,
      frac(answer),
    );
  },
};

// ── 4. weekday counting across a date range ───────────────────────────────────
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Days since 1970-01-01 by the civil-from-days inverse (Howard Hinnant), no Date object.
export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
const weekdayOf = (days: number) => (((days + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday (index 3, Monday = 0)
const dim = (y: number, m: number) => [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export const reasonWeekdays: V4Task = {
  id: 'reason-weekday-count-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    const y1 = rng.int(2026, 2031);
    const m1 = rng.int(1, 12);
    const d1 = rng.int(1, dim(y1, m1));
    const start = daysFromCivil(y1, m1, d1);
    const span = rng.int(40, 700);
    // Walk months to name the end date (keeps the solver Date-free).
    let y2 = y1, m2 = m1, d2 = d1 + span;
    while (d2 > dim(y2, m2)) { d2 -= dim(y2, m2); m2++; if (m2 > 12) { m2 = 1; y2++; } }
    const end = daysFromCivil(y2, m2, d2);
    const want = rng.int(0, 6);
    const w0 = weekdayOf(start);
    const offset = (want - w0 + 7) % 7;
    const count = start + offset > end ? 0 : Math.floor((end - (start + offset)) / 7) + 1;
    return single(
      `${MONTHS[m1 - 1]} ${d1}, ${y1} is a ${WEEKDAYS[w0]}. How many ${WEEKDAYS[want]}s are there from ${MONTHS[m1 - 1]} ${d1}, ${y1} ` +
        `through ${MONTHS[m2 - 1]} ${d2}, ${y2}, counting both of those dates? ${INT_FORMAT}`,
      frac(count),
    );
  },
};

// ── 5. logic grid ─────────────────────────────────────────────────────────────
const NAMES = ['Ava', 'Ben', 'Cleo', 'Dan', 'Eva', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jon', 'Kai', 'Lena', 'Milo', 'Nora', 'Omar', 'Pia'];
const PETS = ['cat', 'dog', 'parrot', 'rabbit', 'turtle', 'hamster', 'ferret', 'goldfish'];
const DRINKS = ['tea', 'coffee', 'milk', 'juice', 'cocoa', 'lemonade', 'soda', 'water'];

type Cat = 0 | 1 | 2; // name, pet, drink
interface Ent { cat: Cat; v: string }
type Assign = string[][]; // [cat][house] = value
interface Clue { text: string; holds(a: Assign): boolean }

const perms4 = (() => {
  const out: number[][] = [];
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) { out.push(cur); return; }
    rest.forEach((x, i) => rec([...cur, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], [0, 1, 2, 3]);
  return out;
})();

export function entPhrase(e: Ent): string {
  return e.cat === 0 ? e.v : e.cat === 1 ? `the ${e.v} owner` : `the ${e.v} drinker`;
}
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const houseOf = (a: Assign, e: Ent) => a[e.cat].indexOf(e.v);

function allAssignments(vals: string[][]): Assign[] {
  const out: Assign[] = [];
  for (const p1 of perms4) for (const p2 of perms4) {
    // Names fixed by position permutation too; enumerate all three.
    for (const p0 of perms4) out.push([p0.map((i) => vals[0][i]), p1.map((i) => vals[1][i]), p2.map((i) => vals[2][i])]);
  }
  return out;
}

function randomClue(rng: Rng, sol: Assign): Clue {
  const ent = (): Ent => { const cat = rng.int(0, 2) as Cat; return { cat, v: rng.pick(sol[cat]) }; };
  for (;;) {
    const kind = rng.int(0, 5);
    const e1 = ent();
    let e2 = ent();
    const h1 = houseOf(sol, e1);
    if (kind === 0) {
      return { text: `${cap1(entPhrase(e1))} lives in house ${h1 + 1}.`, holds: (a) => houseOf(a, e1) === h1 };
    }
    if (kind === 1) {
      const k = rng.pick([0, 1, 2, 3].filter((x) => x !== h1));
      return { text: `${cap1(entPhrase(e1))} does not live in house ${k + 1}.`, holds: (a) => houseOf(a, e1) !== k };
    }
    if (e1.cat === e2.cat && e1.v === e2.v) continue;
    const h2 = houseOf(sol, e2);
    if (kind === 2 && h1 === h2 && e1.cat !== e2.cat) {
      return { text: `${cap1(entPhrase(e1))} and ${entPhrase(e2)} live in the same house.`, holds: (a) => houseOf(a, e1) === houseOf(a, e2) };
    }
    if (kind === 3 && h1 + 1 === h2) {
      return { text: `${cap1(entPhrase(e1))} lives directly left of ${entPhrase(e2)}.`, holds: (a) => houseOf(a, e1) + 1 === houseOf(a, e2) };
    }
    if (kind === 4 && h1 < h2) {
      return { text: `${cap1(entPhrase(e1))} lives somewhere left of ${entPhrase(e2)}.`, holds: (a) => houseOf(a, e1) < houseOf(a, e2) };
    }
    if (kind === 5 && Math.abs(h1 - h2) === 1) {
      return { text: `${cap1(entPhrase(e1))} and ${entPhrase(e2)} live next to each other.`, holds: (a) => Math.abs(houseOf(a, e1) - houseOf(a, e2)) === 1 };
    }
    e2 = ent();
  }
}

export const reasonLogicGrid: V4Task = {
  id: 'reason-logic-grid-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const vals = [rng.shuffle(NAMES).slice(0, 4), rng.shuffle(PETS).slice(0, 4), rng.shuffle(DRINKS).slice(0, 4)];
    const sol: Assign = vals.map((v) => rng.shuffle(v));
    const space = allAssignments(vals);
    const clues: Clue[] = [];
    let alive = space;
    while (alive.length > 1) {
      const c = randomClue(rng, sol);
      const next = alive.filter((a) => c.holds(a));
      if (next.length < alive.length) { clues.push(c); alive = next; }
    }
    // Drop clues that are no longer needed, so each one carries weight.
    for (let i = clues.length - 1; i >= 0; i--) {
      const rest = clues.filter((_, j) => j !== i);
      if (space.filter((a) => rest.every((c) => c.holds(a))).length === 1) clues.splice(i, 1);
    }
    const askCat = rng.int(1, 2) as Cat;
    const askVal = rng.pick(sol[askCat]);
    const answer = sol[askCat].indexOf(askVal) + 1;
    return single(
      `Four houses stand in a row, numbered 1 to 4 from left to right. Each house has one resident, one pet and one drink, all different: ` +
        `residents ${vals[0].join(', ')}; pets ${vals[1].join(', ')}; drinks ${vals[2].join(', ')}.\n` +
        clues.map((c) => `- ${c.text}`).join('\n') +
        `\nWhich house number is home to ${entPhrase({ cat: askCat, v: askVal })}? ${INT_FORMAT}`,
      frac(answer),
    );
  },
};

// ── 6. shortest route in prose ────────────────────────────────────────────────
const TOWNS = ['Ashford', 'Brill', 'Carrow', 'Dunmore', 'Elston', 'Farley', 'Glenby', 'Harwick', 'Ivel', 'Jarrow', 'Kelby', 'Lorne'];

export function dijkstra(n: number, edges: Array<[number, number, number]>, s: number, t: number): number {
  const dist = Array(n).fill(Infinity);
  const done = Array(n).fill(false);
  dist[s] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const [a, b, w] of edges) {
      if (a === u && dist[u] + w < dist[b]) dist[b] = dist[u] + w;
      if (b === u && dist[u] + w < dist[a]) dist[a] = dist[u] + w;
    }
  }
  return dist[t];
}

export const reasonShortestPath: V4Task = {
  id: 'reason-route-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    for (;;) {
      const n = rng.int(6, 8);
      const towns = rng.shuffle(TOWNS).slice(0, n);
      const edges: Array<[number, number, number]> = [];
      const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      for (let i = 1; i < n; i++) edges.push([i, rng.int(0, i - 1), rng.int(5, 60)]);
      const extra = rng.int(3, 6);
      for (let i = 0; i < extra; i++) {
        const a = rng.int(0, n - 1), b = rng.int(0, n - 1);
        if (a !== b && !has(a, b)) edges.push([a, b, rng.int(5, 60)]);
      }
      const s = 0, t = n - 1;
      const best = dijkstra(n, edges, s, t);
      // Plant a tempting direct road that is slower than the best route.
      if (!has(s, t)) edges.push([s, t, best + rng.int(3, 15)]);
      // Require the best route to use at least 3 roads.
      const direct2 = edges.some(([a, b, w]) => (a === s || b === s) && edges.some(([c, d, w2]) => {
        const mid = a === s ? b : a;
        return ((c === mid && d === t) || (d === mid && c === t)) && w + w2 === best;
      }));
      if (direct2 || edges.some(([a, b, w]) => ((a === s && b === t) || (a === t && b === s)) && w === best)) continue;
      const lines = rng.shuffle(edges).map(([a, b, w]) => `- The road between ${towns[a]} and ${towns[b]} takes ${w} minutes.`);
      return single(
        `Roads run both ways and these are the only roads:\n${lines.join('\n')}\n` +
          `What is the fewest minutes needed to drive from ${towns[s]} to ${towns[t]}? ${INT_FORMAT}`,
        frac(best),
      );
    }
  },
};

// ── 7. project critical path ──────────────────────────────────────────────────
const JOBS = ['survey', 'permits', 'foundation', 'framing', 'roofing', 'wiring', 'plumbing', 'drywall', 'painting', 'flooring', 'landscaping', 'inspection'];

export const reasonCriticalPath: V4Task = {
  id: 'reason-critical-path-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const n = rng.int(6, 8);
    const names = rng.shuffle(JOBS).slice(0, n);
    const dur = names.map(() => rng.int(1, 9));
    const deps: number[][] = names.map((_, i) => {
      if (i === 0) return [];
      const pool = Array.from({ length: i }, (_, j) => j);
      return rng.shuffle(pool).slice(0, rng.int(1, Math.min(2, i)));
    });
    const finish: number[] = [];
    for (let i = 0; i < n; i++) finish[i] = Math.max(0, ...deps[i].map((d) => finish[d])) + dur[i];
    const answer = Math.max(...finish);
    const order = rng.shuffle(names.map((_, i) => i));
    const lines = order.map((i) =>
      `- ${cap1(names[i])} takes ${dur[i]} day${dur[i] === 1 ? '' : 's'}` +
      (deps[i].length ? ` and can start only after ${deps[i].map((d) => names[d]).join(' and ')} ${deps[i].length === 1 ? 'is' : 'are'} finished.` : ' and can start right away.'),
    );
    return single(
      `A project has these jobs. Any number of jobs can run at the same time as long as their prerequisites are done.\n${lines.join('\n')}\n` +
        `What is the smallest number of days to finish every job? ${INT_FORMAT}`,
      frac(answer),
    );
  },
};

// ── 8. currency chain with fees ────────────────────────────────────────────────
const CURRENCIES = ['krona', 'dinar', 'peso', 'rand', 'lira', 'zloty', 'real', 'baht'];

export const reasonCurrencyChain: V4Task = {
  id: 'reason-currency-chain-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    for (;;) {
      const [c1, c2, c3] = rng.shuffle(CURRENCIES).slice(0, 3);
      const amount = rng.int(4, 60) * 50;
      const r1 = frac(rng.int(1, 12), rng.pick([1, 2, 4, 5])); // c2 per c1
      const pct = rng.pick([2, 4, 5, 10, 20]);
      const flat = rng.int(1, 40);
      const r2 = frac(rng.int(1, 12), rng.pick([1, 2, 4, 5, 8])); // c3 per c2
      // amount * r1, keep (100 - pct)%, minus flat, then * r2
      let v = frac(amount * r1.n, r1.d);
      v = frac(v.n * (100 - pct), v.d * 100);
      v = frac(v.n - flat * v.d, v.d);
      if (v.n <= 0) continue;
      v = frac(v.n * r2.n, v.d * r2.d);
      if (v.d !== 1) continue;
      const rate = (r: Frac) => fracStr(r).includes('/') ? (r.n / r.d).toString() : fracStr(r);
      return single(
        `You change ${amount} ${c1} into ${c2} at ${rate(r1)} ${c2} per ${c1}. The exchange keeps ${pct}% of the ${c2} you receive as commission, ` +
          `then charges a flat ${flat} ${c2} handling fee. You change everything left into ${c3} at ${rate(r2)} ${c3} per ${c2}. ` +
          `How many ${c3} do you end with? ${INT_FORMAT}`,
        v,
      );
    }
  },
};

// ── 9. work rate with a departure ─────────────────────────────────────────────
export const reasonWorkRate: V4Task = {
  id: 'reason-work-rate-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const [a, b, c] = [rng.int(2, 9), rng.int(2, 12), rng.int(3, 15)]; // hours alone
      const t = rng.int(15, 150); // minutes before C leaves
      // work per minute, as fractions of the job
      const all = frac(60 * (b * c + a * c + a * b), 3600 * a * b * c); // 1/(60a)+1/(60b)+1/(60c)
      const doneN = all.n * t;
      if (doneN >= all.d) continue; // C must leave before the job is done
      const ab = frac(b + a, 60 * a * b);
      // remaining = 1 - t*all ; time = remaining / ab
      const rem = frac(all.d - doneN, all.d);
      const more = frac(rem.n * ab.d, rem.d * ab.n);
      const total = frac(more.n + t * more.d, more.d);
      if (total.d > 200) continue;
      return single(
        `Alone, Ana paints a fence in ${a} hours, Ben in ${b} hours and Cal in ${c} hours. All three start together; after ${t} minutes Cal leaves, ` +
          `and Ana and Ben finish the fence together. How many minutes after the start is the fence finished? ${FRAC_FORMAT}`,
        total,
      );
    }
  },
};

// ── 10. modular arithmetic with huge exponents ───────────────────────────────
export function powMod(base: number, exp: number, mod: number): number {
  // Cycle detection on the sequence base^k mod m — O(m), no bigints.
  const seen = new Map<number, number>();
  const seq: number[] = [];
  let v = 1 % mod;
  for (let k = 0; ; k++) {
    if (k === exp) return v;
    if (seen.has(v)) {
      const start = seen.get(v)!;
      const len = k - start;
      return seq[start + ((exp - start) % len)];
    }
    seen.set(v, k);
    seq.push(v);
    v = (v * base) % mod;
  }
}

export const reasonModular: V4Task = {
  id: 'reason-modular-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    const a = rng.int(2, 19), b = rng.int(2, 19);
    const n = rng.int(1000, 999999), m = rng.int(1000, 999999);
    const mod = rng.pick([7, 9, 11, 13, 17, 19, 23, 37, 100]);
    const op = rng.pick(['+', '×'] as const);
    const x = powMod(a, n, mod), y = powMod(b, m, mod);
    const answer = op === '+' ? (x + y) % mod : (x * y) % mod;
    const expr = `${a}^${n} ${op} ${b}^${m}`;
    const q = mod === 100 ? `What are the last two digits of ${expr} (as a number from 0 to 99)?` : `What is the remainder when ${expr} is divided by ${mod}?`;
    return single(`${q} ${INT_FORMAT}`, frac(answer));
  },
};

// ── 11. average-speed trap ─────────────────────────────────────────────────────
export const reasonAverageSpeed: V4Task = {
  id: 'reason-average-speed-trap-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    for (;;) {
      const legs = rng.int(2, 3);
      const speeds = Array.from({ length: legs }, () => rng.int(8, 72));
      if (new Set(speeds).size < legs) continue;
      // harmonic mean: legs / sum(1/v)
      let sum = frac(0);
      for (const v of speeds) sum = frac(sum.n * v + sum.d, sum.d * v);
      const avg = frac(legs * sum.d, sum.n);
      const arith = frac(speeds.reduce((s, v) => s + v, 0), legs);
      if (avg.n * arith.d === arith.n * avg.d) continue;
      const vehicle = rng.pick(['cyclist', 'courier van', 'ferry', 'runner', 'delivery drone']);
      const legText = legs === 2
        ? `goes from town P to town Q at ${speeds[0]} km/h and comes straight back along the same route at ${speeds[1]} km/h`
        : `covers three stretches of equal length at ${speeds[0]}, ${speeds[1]} and ${speeds[2]} km/h in turn`;
      return single(`A ${vehicle} ${legText}. What is its average speed over the whole trip, in km/h? ${FRAC_FORMAT}`, avg);
    }
  },
};

// ── 12. three-set survey (inclusion–exclusion) ─────────────────────────────────
const TOPICS = [
  ['tea', 'coffee', 'juice'], ['hiking', 'cycling', 'swimming'], ['jazz', 'rock', 'folk'],
  ['Python', 'Rust', 'Go'], ['chess', 'poker', 'bridge'], ['novels', 'comics', 'poetry'],
];

export const reasonVenn: V4Task = {
  id: 'reason-venn-1',
  suite: 'reason',
  difficulty: 2,
  build(rng) {
    const [x, y, z] = rng.shuffle(rng.pick(TOPICS));
    // Regions: only x, only y, only z, xy only, xz only, yz only, all three, none.
    const r = Array.from({ length: 7 }, () => rng.int(1, 40));
    const none = rng.int(0, 30);
    const total = r.reduce((s, v) => s + v, 0) + none;
    const X = r[0] + r[3] + r[4] + r[6], Y = r[1] + r[3] + r[5] + r[6], Z = r[2] + r[4] + r[5] + r[6];
    const XY = r[3] + r[6], XZ = r[4] + r[6], YZ = r[5] + r[6];
    return single(
      `A survey of ${total} people asked which of ${x}, ${y} and ${z} they like. ${X} like ${x}, ${Y} like ${y} and ${Z} like ${z}. ` +
        `${XY} like both ${x} and ${y}, ${XZ} like both ${x} and ${z}, and ${YZ} like both ${y} and ${z}. ${none} like none of the three. ` +
        `How many like all three? ${INT_FORMAT}`,
      frac(r[6]),
    );
  },
};

export const REASON_TASKS: V4Task[] = [
  reasonTank,
  reasonProbDraw,
  reasonArrangements,
  reasonWeekdays,
  reasonLogicGrid,
  reasonShortestPath,
  reasonCriticalPath,
  reasonCurrencyChain,
  reasonWorkRate,
  reasonModular,
  reasonAverageSpeed,
  reasonVenn,
];
