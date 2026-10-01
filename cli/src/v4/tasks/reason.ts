import type { Grade, Rng, V4Task } from '../types.js';
import { finalLine } from '../util.js';

// Every reasoning task is a template: values are drawn per seed by rejection
// sampling until the answer is clean, and the answer comes from a solver, never
// from a stored key. Each template carries a trap or an extra step where the
// obvious method gives a wrong number (pilot 2: the one-step versions saturated
// at 100 for strong models).

const INT_FORMAT = 'Show your working, then end with a last line of exactly "Final: <integer>" and nothing after it.';
const FRAC_FORMAT =
  'Show your working, then end with a last line of exactly "Final: <a>/<b>" giving the exact value as a fraction in lowest terms (write a plain integer if it is whole), and nothing after it.';

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : Math.abs(x));
const bgcd = (x: bigint, y: bigint): bigint => { x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x; };

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

const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── 1. tank: four events, a phase where it drains, a fractional finish ──────
function drawTank(rng: Rng) {
  for (let attempt = 0; attempt < 50000; attempt++) {
    const a = rng.int(10, 40), b = rng.int(a + 5, 90), c = rng.int(15, 80);
    const l1 = (a * b) / gcd(a, b);
    const lcm = (l1 * c) / gcd(l1, c);
    if (lcm > 4000) continue;
    const cap = lcm * rng.int(1, 3);
    const ra = cap / a, rb = cap / b, rc = cap / c;
    if (rb + 1 > ra) continue;
    const drain = rng.int(rb + 1, Math.min(ra + rb - 1, rb + rc - 1));
    const start = rng.int(1, 9) * Math.max(1, Math.floor(cap / 20));
    if (start >= cap) continue;
    const t1 = rng.int(3, 20), t2 = t1 + rng.int(3, 15), t3 = t2 + rng.int(2, 10);
    // 0..t1: A+B-drain; t1..t2: B-drain (falls); t2..t3: B+C-drain; t3..: B+C (drain shut)
    const r1 = ra + rb - drain, r2 = rb - drain, r3 = rb + rc - drain, r4 = rb + rc;
    if (r1 <= 0 || r2 >= 0 || r3 <= 0) continue;
    const v1 = start + t1 * r1;
    const v2 = v1 + (t2 - t1) * r2;
    const v3 = v2 + (t3 - t2) * r3;
    if (v1 >= cap || v2 <= 0 || v3 >= cap) continue;
    const ans = frac(t3 * r4 + (cap - v3), r4);
    if (ans.d === 1 || ans.d > 60) continue;
    return { cap, a, b, c, drain, start, t1, t2, t3, answer: ans };
  }
  throw new Error('reason-tank: no instance found');
}

export const reasonTank: V4Task = {
  id: 'reason-tank-phases-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const { cap, a, b, c, drain, start, t1, t2, t3, answer } = drawTank(rng);
    return single(
      `A ${cap}-litre tank already holds ${start} litres. Pipe A alone fills an empty tank in ${a} minutes, pipe B in ${b} minutes and pipe C in ${c} minutes. ` +
        `A drain removes ${drain} litres per minute whenever it is open. At minute 0, pipes A and B and the drain are all opened. ` +
        `At minute ${t1} pipe A breaks and stays off for good. At minute ${t2} pipe C is switched on. At minute ${t3} the drain is shut and stays shut. ` +
        `B and C keep running until the tank is full. At what minute (counted from minute 0, as an exact value) does the tank become full? ${FRAC_FORMAT}`,
      answer,
    );
  },
};

// ── 2. conditional probability with two conditions ────────────────────────────
const COLOURS = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'orange', 'purple'];
const OBJECTS = ['marbles', 'socks', 'tokens', 'beads', 'tickets', 'dice'];

export const reasonProbDraw: V4Task = {
  id: 'reason-prob-draw-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const cols = rng.shuffle(COLOURS).slice(0, 4);
      const counts = cols.map(() => rng.int(2, 6));
      const k = rng.int(4, 6);
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]).slice(0, 3);
      const j = rng.int(1, Math.min(k - 1, counts[x]));
      // Condition: at least one y AND at most one z. Event: exactly j of x.
      let num = 0, den = 0;
      const rec = (i: number, left: number, pick: number[]) => {
        if (i === 4) {
          if (left) return;
          let ways = 1;
          for (let t = 0; t < 4; t++) ways *= choose(counts[t], pick[t]);
          if (pick[y] >= 1 && pick[z] <= 1) { den += ways; if (pick[x] === j) num += ways; }
          return;
        }
        for (let q = 0; q <= Math.min(left, counts[i]); q++) rec(i + 1, left - q, [...pick, q]);
      };
      rec(0, k, []);
      if (num <= 0 || num === den) continue;
      return single(
        `A bag holds ${counts.map((n, i) => `${n} ${cols[i]}`).join(', ')} ${rng.pick(OBJECTS)}. ` +
          `You draw ${k} at random without replacement. You are told that at least one of the drawn items is ${cols[y]} and that at most one is ${cols[z]}. ` +
          `Given that, what is the probability that exactly ${j} of the drawn items are ${cols[x]}? ${FRAC_FORMAT}`,
        frac(num, den),
      );
    }
  },
};

// ── 3. arrangements with three no-adjacency constraints ───────────────────────
// Counts distinct arrangements with no two equal letters from `banned` side by side.
export function countArrangements(word: string, banned: string[]): number {
  const letters = [...new Set(word)];
  const start = letters.map((l) => [...word].filter((c) => c === l).length);
  const memo = new Map<string, number>();
  const rec = (counts: number[], prev: number): number => {
    if (counts.every((c) => c === 0)) return 1;
    const key = `${counts.join(',')}|${prev}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    counts.forEach((c, i) => {
      if (!c || (i === prev && banned.includes(letters[i]))) return;
      counts[i]--;
      total += rec(counts, i);
      counts[i]++;
    });
    memo.set(key, total);
    return total;
  };
  return rec(start, -1);
}

const multinomial = (counts: number[]) => {
  let r = 1, used = 0;
  for (const c of counts) { used += c; r *= choose(used, c); }
  return r;
};

export const reasonArrangements: V4Task = {
  id: 'reason-count-arrange-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const letters = rng.shuffle('BCDEFGHKLMNPRSTW'.split(''));
      const [p, q, r] = letters;
      const cs = [rng.int(2, 3), rng.int(2, 3), rng.int(2, 3)];
      const len = rng.int(10, 11);
      const rest = len - cs[0] - cs[1] - cs[2];
      if (rest < 1) continue;
      const pool = letters.slice(3, 3 + rng.int(1, 2));
      const others = Array.from({ length: rest }, () => rng.pick(pool));
      const word = rng.shuffle([...Array(cs[0]).fill(p), ...Array(cs[1]).fill(q), ...Array(cs[2]).fill(r), ...others]).join('');
      const counts = [...new Set(word)].map((l) => [...word].filter((c) => c === l).length);
      if (multinomial(counts) > 400000) continue; // keeps brute-force checking cheap
      const answer = countArrangements(word, [p, q, r]);
      if (answer <= 0) continue;
      return single(
        `How many distinct arrangements of the letters of the string "${word}" have no two ${p}'s next to each other, no two ${q}'s next to each other ` +
          `and no two ${r}'s next to each other? (Arrangements that read the same letter-for-letter count once.) ${INT_FORMAT}`,
        frac(answer),
      );
    }
  },
};

// ── 4. business days with observed holidays ───────────────────────────────────
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Days since 1970-01-01 by the civil-from-days inverse (Howard Hinnant), no Date object.
export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z: number): [number, number, number] {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}
const weekdayOf = (days: number) => (((days + 3) % 7) + 7) % 7; // Monday = 0
const dateName = (days: number) => { const [y, m, d] = civilFromDays(days); return `${MONTHS[m - 1]} ${d}, ${y}`; };

export const reasonWeekdays: V4Task = {
  id: 'reason-weekday-count-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const start = daysFromCivil(rng.int(2026, 2031), rng.int(1, 12), rng.int(1, 28));
      const end = start + rng.int(150, 420);
      const hol = new Set<number>();
      const onDay = (w: number) => { let d = rng.int(start, end - 7); while (weekdayOf(d) !== w) d++; return d; };
      hol.add(onDay(5));
      hol.add(onDay(6));
      hol.add(onDay(4)); // a Friday holiday: collides with the last-Friday closure half the time
      hol.add(rng.pick([start - 1, start - 2, end + 1, end + 2]));
      while (hol.size < 8) hol.add(rng.int(start - 2, end + 2));
      const observed = [...hol].map((h) => { const w = weekdayOf(h); return w === 5 ? h - 1 : w === 6 ? h + 1 : h; });
      if (new Set(observed).size !== observed.length) continue;
      // Last Friday of every month.
      const lastFri = new Set<number>();
      for (let d = start - 40; d <= end + 40; d++) {
        const [y, m] = civilFromDays(d);
        const next = daysFromCivil(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);
        let f = next - 1;
        while (weekdayOf(f) !== 4) f--;
        lastFri.add(f);
        d = next - 1;
      }
      let count = 0;
      for (let d = start; d <= end; d++) if (weekdayOf(d) < 5 && !observed.includes(d) && !lastFri.has(d)) count++;
      const list = rng.shuffle([...hol]).map(dateName).join('; ');
      return single(
        `${dateName(start)} is a ${WEEKDAYS[weekdayOf(start)]}. A company works Monday to Friday. Its holidays are: ${list}. ` +
          `A holiday that falls on a Saturday is observed on the Friday before it, and one that falls on a Sunday is observed on the Monday after it; ` +
          `nobody works on an observed holiday. The office is also closed on the last Friday of every month. ` +
          `How many working days are there from ${dateName(start)} through ${dateName(end)}, counting both of those dates? ${INT_FORMAT}`,
        frac(count),
      );
    }
  },
};

// ── 5. knights and knaves ──────────────────────────────────────────────────────
// Knights always tell the truth, knaves always lie. Statements are generated to
// match a hidden assignment and added until exactly one assignment fits.
const ISLANDERS = ['Ava', 'Ben', 'Cleo', 'Dan', 'Eva', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jon', 'Kai', 'Lena', 'Milo', 'Nora', 'Omar', 'Pia'];

interface Stmt { text: string; truth(k: boolean[]): boolean }

function randomStmt(rng: Rng, n: number, names: string[], self: number): Stmt {
  const other = () => { let x = rng.int(0, n - 1); while (x === self) x = rng.int(0, n - 1); return x; };
  const kind = rng.int(0, 4);
  if (kind === 0) {
    const x = other(), knight = rng.next() < 0.5;
    return { text: `${names[x]} is a ${knight ? 'knight' : 'knave'}.`, truth: (k) => k[x] === knight };
  }
  if (kind === 1) {
    const grp = rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, 3).sort((a, b) => a - b);
    const want = rng.int(0, 3);
    return { text: `Exactly ${want} of ${grp.map((i) => names[i]).join(', ')} ${want === 1 ? 'is a knave' : 'are knaves'}.`, truth: (k) => grp.filter((i) => !k[i]).length === want };
  }
  if (kind === 2) {
    const x = other();
    let y = other(); while (y === x) y = other();
    const same = rng.next() < 0.5;
    return { text: `${names[x]} and ${names[y]} are ${same ? 'the same kind' : 'different kinds'}.`, truth: (k) => (k[x] === k[y]) === same };
  }
  if (kind === 3) {
    const want = rng.int(1, n - 1);
    return { text: `At least ${want} of the ${n} of us are knights.`, truth: (k) => k.filter(Boolean).length >= want };
  }
  const x = other();
  let y = other(); while (y === x) y = other();
  return { text: `If ${names[x]} is a knight, then ${names[y]} is a knave.`, truth: (k) => !k[x] || !k[y] };
}

export const reasonLogicGrid: V4Task = {
  id: 'reason-logic-grid-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const n = rng.int(7, 8);
      const names = rng.shuffle(ISLANDERS).slice(0, n);
      const sol = names.map(() => rng.next() < 0.5);
      const space = Array.from({ length: 1 << n }, (_, m) => names.map((_, i) => !!(m & (1 << i))));
      // Each islander speaks once; a statement is kept only if it is true exactly when its speaker is a knight.
      const said: Array<{ who: number; s: Stmt }> = [];
      for (let who = 0; who < n; who++) {
        for (;;) {
          const st = randomStmt(rng, n, names, who);
          if (st.truth(sol) === sol[who]) { said.push({ who, s: st }); break; }
        }
      }
      const fits = space.filter((k) => said.every(({ who, s }) => s.truth(k) === k[who]));
      if (fits.length !== 1) continue;
      const knights = sol.map((v, i) => (v ? i + 1 : 0)).filter(Boolean);
      const answer = 100 * knights.length + knights.reduce((a, b) => a + b, 0);
      return single(
        `On an island every person is either a knight, who always tells the truth, or a knave, who always lies. ` +
          `${n} islanders sit in seats numbered 1 to ${n}: ${names.map((x, i) => `${x} (seat ${i + 1})`).join(', ')}. Each says one thing:\n` +
          said.map(({ who, s }) => `- ${names[who]}: "${s.text}"`).join('\n') +
          `\nLet K be the number of knights and S the sum of the knights' seat numbers. What is 100K + S? ${INT_FORMAT}`,
        frac(answer),
      );
    }
  },
};

// ── 6. route through a required stop, with closed roads ───────────────────────
const TOWNS = ['Ashford', 'Brill', 'Carrow', 'Dunmore', 'Elston', 'Farley', 'Glenby', 'Harwick', 'Ivel', 'Jarrow', 'Kelby', 'Lorne', 'Marsh', 'Norbury'];

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
  difficulty: 3,
  build(rng) {
    for (;;) {
      const n = rng.int(11, 13);
      const towns = rng.shuffle(TOWNS).slice(0, n);
      const edges: Array<[number, number, number]> = [];
      const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      for (let i = 1; i < n; i++) edges.push([i, rng.int(0, i - 1), rng.int(5, 60)]);
      const extra = rng.int(8, 12);
      for (let i = 0; i < extra; i++) {
        const a = rng.int(0, n - 1), b = rng.int(0, n - 1);
        if (a !== b && !has(a, b)) edges.push([a, b, rng.int(5, 60)]);
      }
      const s = 0, t = n - 1;
      const [v1, v2] = rng.shuffle(Array.from({ length: n - 2 }, (_, i) => i + 1)).slice(0, 2);
      const d = (es: Array<[number, number, number]>, x: number, y: number) => dijkstra(n, es, x, y);
      const route = (es: Array<[number, number, number]>) =>
        Math.min(d(es, s, v1) + d(es, v1, v2) + d(es, v2, t), d(es, s, v2) + d(es, v2, v1) + d(es, v1, t));
      const before = route(edges);
      const closedIdx = rng.shuffle(edges.map((_, i) => i)).slice(0, 3);
      const open = edges.filter((_, i) => !closedIdx.includes(i));
      const best = route(open);
      // Closures must matter, and the naive order (the one listed) must not be the best.
      const listedOrder = d(open, s, v1) + d(open, v1, v2) + d(open, v2, t);
      if (!Number.isFinite(best) || best === before || listedOrder === best) continue;
      const lines = rng.shuffle(edges).map(([a, b, w]) => `- The road between ${towns[a]} and ${towns[b]} takes ${w} minutes.`);
      const closed = closedIdx.map((i) => `${towns[edges[i][0]]} and ${towns[edges[i][1]]}`);
      return single(
        `Roads run both ways and these are the only roads:\n${lines.join('\n')}\n` +
          `Today these roads are closed: between ${closed.join('; between ')}. ` +
          `You must drive from ${towns[s]} to ${towns[t]} and stop in both ${towns[v1]} and ${towns[v2]} on the way, in either order ` +
          `(passing through any town more than once is allowed). What is the fewest minutes of driving? ${INT_FORMAT}`,
        frac(best),
      );
    }
  },
};

// ── 7. project schedule with waits and earliest starts ────────────────────────
const JOBS = ['survey', 'permits', 'foundation', 'framing', 'roofing', 'wiring', 'plumbing', 'drywall', 'painting', 'flooring', 'landscaping', 'inspection'];

// Two crews; whenever a crew is free, it starts the ready job with the longest
// duration (ties: alphabetical). Event-driven simulation.
export function crewSchedule(
  jobs: Array<{ name: string; dur: number; release: number; deps: Array<{ j: number; wait: number }> }>, crews: number,
): number {
  const finish: Array<number | null> = jobs.map(() => null);
  const started = jobs.map(() => false);
  const busy: number[] = []; // finish times of running jobs
  let now = 0;
  for (;;) {
    for (let i = busy.length - 1; i >= 0; i--) if (busy[i] <= now) busy.splice(i, 1);
    const ready = jobs
      .map((jb, i) => ({ jb, i }))
      .filter(({ jb, i }) => !started[i] && now >= jb.release && jb.deps.every((d) => finish[d.j] !== null && finish[d.j]! + d.wait <= now))
      .sort((a, b) => b.jb.dur - a.jb.dur || a.jb.name.localeCompare(b.jb.name));
    while (busy.length < crews && ready.length) {
      const { jb, i } = ready.shift()!;
      started[i] = true;
      finish[i] = now + jb.dur;
      busy.push(now + jb.dur);
    }
    if (started.every(Boolean)) return Math.max(...(finish as number[]));
    // Next moment anything can change: a crew frees, a release date, or a wait ends.
    const cands = [
      ...busy,
      ...jobs.map((jb) => jb.release),
      ...jobs.flatMap((jb) => jb.deps.map((d) => (finish[d.j] === null ? Infinity : finish[d.j]! + d.wait))),
    ].filter((t) => t > now);
    now = Math.min(...cands);
  }
}

export const reasonCriticalPath: V4Task = {
  id: 'reason-critical-path-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const n = rng.int(9, 11);
    const names = rng.shuffle(JOBS).slice(0, n);
    const jobs = names.map((name, i) => ({
      name,
      dur: rng.int(1, 9),
      release: 0,
      deps: i === 0 ? [] : rng.shuffle(Array.from({ length: i }, (_, j) => j)).slice(0, rng.int(0, Math.min(2, i))).map((j) => ({ j, wait: rng.next() < 0.3 ? rng.int(1, 3) : 0 })),
    }));
    for (const i of rng.shuffle(names.map((_, i) => i)).slice(0, 2)) jobs[i].release = rng.int(3, 12);
    const answer = crewSchedule(jobs, 2);
    const order = rng.shuffle(names.map((_, i) => i));
    const lines = order.map((i) => {
      const jb = jobs[i];
      const need = jb.deps.length
        ? `needs: ${jb.deps.map((d) => (d.wait ? `${names[d.j]} +${d.wait} days wait` : names[d.j])).join(', ')}.`
        : 'needs: nothing.';
      return `- ${cap1(jb.name)} (${jb.dur} day${jb.dur === 1 ? '' : 's'}) ${need}${jb.release ? ` It cannot start before day ${jb.release}.` : ''}`;
    });
    return single(
      `A project starts on day 0 with exactly 2 crews; each crew works on one job at a time and a job, once started, runs to the end without a break. ` +
        `Each job lists the jobs that must be finished before it can start; "+N days wait" means it must also wait N more days after that job finishes. ` +
        `Rule: whenever a crew is free and at least one job is ready, that crew immediately starts the ready job with the longest duration ` +
        `(ties go to the job whose name comes first alphabetically).\n${lines.join('\n')}\n` +
        `Following that rule exactly, on what day does the last job finish? ${INT_FORMAT}`,
      frac(answer),
    );
  },
};

// ── 8. best conversion route through a table with fees ────────────────────────
const CURRENCIES = ['krona', 'dinar', 'peso', 'rand', 'lira', 'zloty', 'real', 'baht'];

type BF = [bigint, bigint];
const bfNorm = ([n, d]: BF): BF => { const g = bgcd(n, d) || 1n; return [n / g, d / g]; };
const bfMul = (a: BF, b: BF): BF => bfNorm([a[0] * b[0], a[1] * b[1]]);
const bfCmp = (a: BF, b: BF) => (a[0] * b[1] === b[0] * a[1] ? 0 : a[0] * b[1] > b[0] * a[1] ? 1 : -1);

export const reasonCurrencyChain: V4Task = {
  id: 'reason-currency-chain-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const cur = rng.shuffle(CURRENCIES).slice(0, 6);
      const s = 0, t = 5;
      const rates: Array<{ a: number; b: number; rate: BF; fee: number }> = [];
      const have = (a: number, b: number) => rates.some((r) => r.a === a && r.b === b);
      const nRates = rng.int(12, 15);
      while (rates.length < nRates) {
        const a = rng.int(0, 4), b = rng.int(1, 5);
        if (a === b || have(a, b) || b === s || a === t) continue;
        const den = rng.pick([1n, 2n, 4n, 5n, 10n]);
        rates.push({ a, b, rate: bfNorm([BigInt(rng.int(2, 40)), den]), fee: rng.pick([0, 1, 2, 4, 5]) });
      }
      if (!have(s, t)) continue;
      const amount = BigInt(rng.int(2, 40) * 100);
      // Best final amount over simple routes of at most 3 conversions.
      let best: BF | null = null;
      let bestLen = 0;
      let ties = 0;
      const dfs = (at: number, v: BF, seen: Set<number>, len: number) => {
        if (at === t) {
          const c = best ? bfCmp(v, best) : 1;
          if (c > 0) { best = v; bestLen = len; ties = 0; } else if (c === 0) ties++;
          return;
        }
        if (len === 4) return;
        for (const r of rates) {
          if (r.a !== at || seen.has(r.b)) continue;
          seen.add(r.b);
          dfs(r.b, bfMul(bfMul(v, r.rate), [BigInt(100 - r.fee), 100n]), seen, len + 1);
          seen.delete(r.b);
        }
      };
      dfs(s, [amount, 1n], new Set([s]), 0);
      // The direct conversion must not be the best route, and the best must be unique.
      if (!best || bestLen < 3 || ties > 0) continue;
      const b = best as BF;
      if (b[1] > 100000n || b[0] > 1_000_000_000n) continue;
      const rateText = (r: BF) => (r[1] === 1n ? `${r[0]}` : `${Number(r[0]) / Number(r[1])}`);
      const lines = rng.shuffle(rates).map((r) =>
        `- 1 ${cur[r.a]} buys ${rateText(r.rate)} ${cur[r.b]}${r.fee ? `, with a ${r.fee}% fee taken from the ${cur[r.b]} you receive` : ', no fee'}.`);
      return single(
        `A money changer offers only these one-way conversions:\n${lines.join('\n')}\n` +
          `You have ${amount} ${cur[s]} and want as many ${cur[t]} as possible, using at most four conversions and never holding the same currency twice. ` +
          `How many ${cur[t]} can you end with? ${FRAC_FORMAT}`,
        frac(Number(b[0]), Number(b[1])),
      );
    }
  },
};

// ── 9. work rate: a break, a departure and a late arrival ─────────────────────
export const reasonWorkRate: V4Task = {
  id: 'reason-work-rate-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const [a, b, c, d] = [rng.int(2, 9), rng.int(3, 12), rng.int(3, 15), rng.int(2, 10)];
      const t1 = rng.int(15, 60); // Cal leaves
      const bs = rng.int(5, 50), be = bs + rng.int(10, 40); // Ana's break [bs, be)
      const t2 = rng.int(t1 + 5, t1 + 90); // Dee arrives
      // Rates per minute in units of U = 60abcd.
      const U = 60 * a * b * c * d;
      const rA = b * c * d, rB = a * c * d, rC = a * b * d, rD = a * b * c;
      const rateAt = (m: number) => (m >= bs && m < be ? 0 : rA) + rB + (m < t1 ? rC : 0) + (m >= t2 ? rD : 0);
      let done = 0, m = 0;
      while (m < Math.max(t2, be) && done < U) { done += rateAt(m); m++; }
      if (done >= U) continue; // everyone listed must still matter
      const r = rateAt(m);
      const total = frac((U - done) + m * r, r);
      if (total.d === 1 || total.d > 400) continue;
      return single(
        `Alone, Ana paints a fence in ${a} hours, Ben in ${b} hours, Cal in ${c} hours and Dee in ${d} hours. Ana, Ben and Cal start together at minute 0. ` +
          `Cal leaves for good at minute ${t1}. Ana takes a break from minute ${bs} to minute ${be} and then goes back to painting. ` +
          `Dee arrives at minute ${t2} and paints until the fence is finished. Everyone who is painting works at their own steady rate. ` +
          `At what minute is the fence finished? ${FRAC_FORMAT}`,
        total,
      );
    }
  },
};

// ── 10. divisibility: "exactly two" of four non-coprime divisors ──────────────
export function lcmN(xs: number[]): number {
  return xs.reduce((l, x) => (l * x) / gcd(l, x), 1);
}

export const reasonModular: V4Task = {
  id: 'reason-modular-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const primes = rng.shuffle([2, 3, 5, 7, 11]).slice(0, 3);
      // Divisors built from shared primes so that lcm, not product, matters.
      const divs = new Set<number>();
      while (divs.size < 4) divs.add(rng.pick(primes) * rng.pick(primes) * rng.pick([1, 1, rng.pick(primes)]));
      const ds = [...divs].sort((x, y) => x - y);
      if (ds.some((x, i) => ds.some((y, j) => i !== j && y % x === 0))) continue; // no divisor divides another
      const lo = rng.int(1, 50) * 100 + 1;
      const hi = lo + rng.int(3000, 60000);
      // Inclusion–exclusion over subsets: count of integers in [lo, hi] hitting exactly two.
      const cnt = (L: number) => Math.floor(hi / L) - Math.floor((lo - 1) / L);
      let exactly2 = 0;
      for (let mask = 1; mask < 16; mask++) {
        const sub = ds.filter((_, i) => mask & (1 << i));
        if (sub.length < 2) continue;
        const coef = sub.length === 2 ? 1 : sub.length === 3 ? -3 : 6;
        exactly2 += coef * cnt(lcmN(sub));
      }
      if (exactly2 <= 0) continue;
      return single(
        `How many integers n with ${lo} ≤ n ≤ ${hi} are divisible by exactly two of the four numbers ${ds.join(', ')}? ` +
          `(Divisible by exactly two means divisible by two of them and not by the other two.) ${INT_FORMAT}`,
        frac(exactly2),
      );
    }
  },
};

// ── 11. average speed: thirds by distance, one third split by time, a stop ────
export const reasonAverageSpeed: V4Task = {
  id: 'reason-average-speed-trap-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    for (;;) {
      const [v1, v2, v3, v4] = [rng.int(6, 60), rng.int(6, 60), rng.int(6, 60), rng.int(6, 60)];
      if (new Set([v1, v2, v3, v4]).size < 4) continue;
      const D = rng.int(2, 20) * 3; // km, whole thirds
      const stop = rng.pick([10, 12, 15, 20, 30]); // minutes
      const third = D / 3;
      // hours: third/v1 + third*2/(v2+v3) + third/v4 + stop/60
      let t = frac(third, v1);
      const add = (x: Frac) => { t = frac(t.n * x.d + x.n * t.d, t.d * x.d); };
      add(frac(2 * third, v2 + v3));
      add(frac(third, v4));
      add(frac(stop, 60));
      const avg = frac(D * t.d, t.n);
      if (avg.d === 1) continue;
      const vehicle = rng.pick(['cyclist', 'courier van', 'ferry', 'runner', 'delivery drone']);
      return single(
        `A ${vehicle} makes a ${D} km trip in three stretches of equal distance. It covers the first stretch at a steady ${v1} km/h. ` +
          `On the second stretch, for half of the time that stretch takes it moves at ${v2} km/h and for the other half of that time at ${v3} km/h. ` +
          `It then stops for ${stop} minutes before covering the last stretch at a steady ${v4} km/h. ` +
          `What is its average speed over the whole trip, including the stop, in km/h? ${FRAC_FORMAT}`,
        avg,
      );
    }
  },
};

// ── 12. four-set survey stated with "at least" counts ──────────────────────────
const TOPICS = [
  ['tea', 'coffee', 'juice', 'cocoa'], ['hiking', 'cycling', 'swimming', 'rowing'], ['jazz', 'rock', 'folk', 'opera'],
  ['Python', 'Rust', 'Go', 'Java'], ['chess', 'poker', 'bridge', 'go'], ['novels', 'comics', 'poetry', 'essays'],
];

export const reasonVenn: V4Task = {
  id: 'reason-venn-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const names = rng.shuffle(rng.pick(TOPICS));
    const region = Array.from({ length: 16 }, (_, m) => (m === 0 ? 0 : rng.int(0, 25)));
    const none = rng.int(0, 40);
    const bits = (m: number) => [0, 1, 2, 3].filter((i) => m & (1 << i)).length;
    const total = region.reduce((s, v) => s + v, 0) + none;
    const like = [0, 1, 2, 3].map((i) => region.reduce((s, v, m) => s + (m & (1 << i) ? v : 0), 0));
    // Sum over the six pairs of |A ∩ B|: a person in k sets is counted C(k,2) times.
    const pairSum = region.reduce((s, v, m) => s + v * choose(bits(m), 2), 0);
    const atLeast3 = region.reduce((s, v, m) => s + (bits(m) >= 3 ? v : 0), 0);
    const all4 = region[15];
    return single(
      `A survey of ${total} people asked which of ${names.join(', ')} they like. ` +
        `${like.map((v, i) => `${v} like ${names[i]}`).join(', ')}. ` +
        `If you take each of the six pairs of these four, count the people who like both in the pair, and add the six counts, you get ${pairSum}. ` +
        `${atLeast3} people like at least three of the four, and ${all4} like all four. ` +
        `How many people like none of the four? ${INT_FORMAT}`,
      frac(none),
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
