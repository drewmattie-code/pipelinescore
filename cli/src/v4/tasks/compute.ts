import type { Grade, Rng, V4Task } from '../types.js';
import { finalLine } from '../util.js';

// Exact compute: business arithmetic a model has to get right to the digit or the
// cent with no tools (big products, invoice totals, tiered rebates, landed cost,
// FX chains, cable takeoffs, margin pricing). Like reason, every task is a template:
// values are drawn per seed and the answer comes from an exact BigInt solver, never
// from a stored key. Rounding rules are stated in each prompt, so the grade is exact
// match on the final line.

const FORMAT = 'Do not use any tools or code. Show your working, then end with a last line of exactly "Final: <number>" and nothing after it.';

// ── exact rationals on BigInt ───────────────────────────────────────────────
interface Q { n: bigint; d: bigint }
const bgcd = (x: bigint, y: bigint): bigint => { x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x || 1n; };
export function q(n: bigint, d = 1n): Q {
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d);
  return { n: n / g, d: d / g };
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);

// Decimal string like "2.5" or "1234.56" to an exact rational.
export function dec(s: string): Q {
  const neg = s.startsWith('-');
  const [w, f = ''] = s.replace('-', '').split('.');
  const n = BigInt(w + f) * (neg ? -1n : 1n);
  return q(n, 10n ** BigInt(f.length));
}

// Round half up (away from zero for positives) to `places` decimals, exact.
export function roundHalfUp(x: Q, places: number): Q {
  const scale = 10n ** BigInt(places);
  const num = x.n * scale;
  const neg = num < 0n;
  const a = neg ? -num : num;
  let r = a / x.d;
  if ((a % x.d) * 2n >= x.d) r += 1n;
  return q(neg ? -r : r, scale);
}

// Round up to the next multiple of `step` (e.g. 0.05), exact.
export function roundUpTo(x: Q, step: Q): Q {
  const k = div(x, step);
  let m = k.n / k.d;
  if (m * k.d < k.n) m += 1n;
  return mul(q(m), step);
}

// Fixed decimal string for display, e.g. 1234.5 at 2 places -> "1234.50".
export function fmt(x: Q, places: number): string {
  const scale = 10n ** BigInt(places);
  const r = roundHalfUp(x, places);
  const v = (r.n * scale) / r.d;
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(places + 1, '0');
  const s = places ? `${a.slice(0, -places)}.${a.slice(-places)}` : a;
  return neg ? `-${s}` : s;
}

const money = (cents: number) => fmt(q(BigInt(cents), 100n), 2);
const comma = (s: string) => {
  const [w, f] = s.split('.');
  return w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f !== undefined ? `.${f}` : '');
};

// Reads "Final: 1,234.50", "Final: $1234.5", "Final: 121932631112635269" exactly.
export function parseFinalExact(text: string): Q | null {
  const m = finalLine(text).replace(/\*/g, '').match(/^Final:\s*\$?\s*(-?[\d,]*\.?\d+)\s*\.?$/i);
  if (!m) return null;
  const s = m[1].replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  return dec(s.startsWith('.') ? `0${s}` : s.replace(/^-\./, '-0.'));
}

function gradeExact(text: string, want: Q, places: number): Grade {
  const got = parseFinalExact(text);
  if (got && got.n === want.n && got.d === want.d) return { score: 1, detail: `Final: ${fmt(got, places)}` };
  return { score: 0, detail: `want ${fmt(want, places)}, got ${got ? fmt(got, Math.max(places, 2)) : `"${finalLine(text).slice(0, 60)}"`}` };
}

function single(content: string, want: Q, places: number) {
  return {
    kind: 'single' as const,
    messages: [{ role: 'user' as const, content: `${content}\n\n${FORMAT}` }],
    grade: (res: { text: string }) => gradeExact(res.text, want, places),
  };
}

const digits = (rng: Rng, n: number) => {
  let s = String(rng.int(1, 9));
  for (let i = 1; i < n; i++) s += String(rng.int(0, 9));
  return BigInt(s);
};

// ── templates (each returns the prompt and the exact answer) ────────────────
export function drawBigMultiply(rng: Rng) {
  const a = digits(rng, rng.int(15, 18));
  const b = digits(rng, rng.int(9, 12));
  return { prompt: `Compute the exact product ${a} × ${b}. Give every digit.`, want: q(a * b), places: 0 };
}

export function drawColumnTotal(rng: Rng) {
  const lines = Array.from({ length: 14 }, () => rng.int(1, 9) * 10 ** rng.int(4, 6) + rng.int(0, 999_99));
  const total = lines.reduce((s, c) => s + c, 0);
  const list = lines.map((c, i) => `${String(i + 1).padStart(2, ' ')}. $${comma(money(c))}`).join('\n');
  return { prompt: `An invoice has these line amounts:\n${list}\n\nWhat is the invoice total in dollars, to the cent?`, want: q(BigInt(total), 100n), places: 2 };
}

export function drawTieredRebate(rng: Rng) {
  const t1 = rng.pick([25_000, 50_000, 75_000]);
  const t2 = t1 + rng.pick([50_000, 100_000, 150_000]);
  const [p1, p2, p3] = [rng.pick(['1.5', '2', '2.5']), rng.pick(['3', '3.5', '4']), rng.pick(['4.5', '5', '6.25'])];
  const totalCents = rng.int(t2 * 100 + 1, (t2 + 120_000) * 100);
  const total = q(BigInt(totalCents), 100n);
  const pct = (p: string) => div(dec(p), q(100n));
  let r = mul(q(BigInt(t1)), pct(p1));
  r = add(r, mul(q(BigInt(t2 - t1)), pct(p2)));
  r = add(r, mul(sub(total, q(BigInt(t2))), pct(p3)));
  const prompt = `A supplier pays a volume rebate on annual purchases: ${p1}% on the first $${comma(String(t1))}, ${p2}% on the next $${comma(String(t2 - t1))}, and ${p3}% on everything above $${comma(String(t2))}. ` +
    `A distributor bought $${comma(money(totalCents))} this year. What is the rebate in dollars? Round only the final answer, half up, to the cent.`;
  return { prompt, want: roundHalfUp(r, 2), places: 2 };
}

export function drawLandedCost(rng: Rng) {
  const skus = ['breaker panels', 'cable reels', 'conduit bundles'].map((name) => ({
    name, qty: rng.int(12, 240), unitCents: rng.int(18_00, 950_00), kg: rng.int(80, 2400),
  }));
  const freightCents = rng.int(1_200_00, 9_800_00);
  const duty = rng.pick(['4.5', '6', '7.5', '8.25']);
  const target = rng.int(0, 2);
  const kgTotal = skus.reduce((s, x) => s + x.kg, 0);
  const t = skus[target];
  const goods = q(BigInt(t.qty * t.unitCents), 100n);
  const freight = mul(q(BigInt(freightCents), 100n), q(BigInt(t.kg), BigInt(kgTotal)));
  const dutied = mul(add(goods, freight), add(q(1n), div(dec(duty), q(100n))));
  const perUnit = div(dutied, q(BigInt(t.qty)));
  const rows = skus.map((x) => `- ${x.name}: ${x.qty} units at $${comma(money(x.unitCents))} each, total shipping weight ${x.kg} kg`).join('\n');
  const prompt = `A container holds:\n${rows}\n\nOcean freight for the whole container is $${comma(money(freightCents))}, allocated to each line in proportion to its shipping weight. ` +
    `Import duty of ${duty}% is charged on each line's goods value plus its allocated freight. What is the landed cost per unit of the ${t.name}, in dollars? Round only the final answer, half up, to the cent.`;
  return { prompt, want: roundHalfUp(perUnit, 2), places: 2 };
}

export function drawDiscountChain(rng: Rng) {
  const listCents = rng.int(400_00, 48_000_00);
  const d1 = rng.pick(['12.5', '15', '17.5', '20']);
  const d2 = rng.pick(['3', '5', '7', '8.5']);
  const tax = '13';
  let x = q(BigInt(listCents), 100n);
  for (const d of [d1, d2]) x = mul(x, sub(q(1n), div(dec(d), q(100n))));
  x = mul(x, add(q(1n), div(dec(tax), q(100n))));
  const prompt = `A contractor's list price is $${comma(money(listCents))}. Their account gets a ${d1}% discount, then an extra ${d2}% off the discounted price, then 13% HST is added. ` +
    'What is the final amount in dollars? Round only the final answer, half up, to the cent.';
  return { prompt, want: roundHalfUp(x, 2), places: 2 };
}

export function drawFxChain(rng: Rng) {
  const cadCents = rng.int(10_000_00, 900_000_00);
  const r1 = `0.${rng.int(6900, 7600)}`;
  const r2 = `0.${rng.int(8600, 9500)}`;
  const usd = roundHalfUp(mul(q(BigInt(cadCents), 100n), dec(r1)), 2);
  const eur = roundHalfUp(mul(usd, dec(r2)), 2);
  const prompt = `Convert CAD $${comma(money(cadCents))} to US dollars at 1 CAD = ${r1} USD and round half up to the cent. ` +
    `Then convert that US dollar amount to euros at 1 USD = ${r2} EUR and round half up to the cent. What is the final amount in euros?`;
  return { prompt, want: eur, places: 2 };
}

export function drawReelTakeoff(rng: Rng) {
  const runs = Array.from({ length: 8 }, () => rng.int(85, 1450));
  const ft = runs.reduce((s, x) => s + x, 0);
  const metres = mul(q(BigInt(ft)), dec('0.3048'));
  const reelM = rng.pick([305, 500]);
  const reels = (metres.n + BigInt(reelM) * metres.d - 1n) / (BigInt(reelM) * metres.d);
  const left = sub(q(reels * BigInt(reelM)), metres);
  const prompt = `A job needs these cable runs, in feet: ${runs.join(', ')}. Cable comes on ${reelM} m reels and 1 ft is exactly 0.3048 m. ` +
    `Using the fewest whole reels, how many metres of cable are left over after cutting all the runs (treat the runs as one total length)? Give the exact answer in metres.`;
  return { prompt, want: left, places: 4 };
}

export function drawMarginPrice(rng: Rng) {
  const costCents = rng.int(12_00, 4_800_00);
  const margin = rng.pick(['22.5', '27', '32.5', '35', '38.75']);
  const price = div(q(BigInt(costCents), 100n), sub(q(1n), div(dec(margin), q(100n))));
  const want = roundUpTo(price, dec('0.05'));
  const prompt = `An item costs $${comma(money(costCents))}. Set the selling price so the gross margin on the selling price is at least ${margin}%, ` +
    'then round the price up to the next multiple of $0.05 (leave it unchanged if it already is one). What is the selling price in dollars?';
  return { prompt, want, places: 2 };
}

export function drawLongDivision(rng: Rng) {
  const n = digits(rng, rng.int(12, 14));
  const d = digits(rng, rng.int(4, 5));
  return { prompt: `Divide ${n} by ${d}. Give the result rounded half up to 2 decimal places.`, want: roundHalfUp(q(n, d), 2), places: 2 };
}

const T = (id: string, difficulty: 1 | 2 | 3, draw: (rng: Rng) => { prompt: string; want: Q; places: number }): V4Task => ({
  id, suite: 'compute', difficulty,
  build: (rng) => { const { prompt, want, places } = draw(rng); return single(prompt, want, places); },
});

export const COMPUTE_TASKS: V4Task[] = [
  T('compute-big-multiply-1', 2, drawBigMultiply),
  T('compute-column-total-1', 1, drawColumnTotal),
  T('compute-tiered-rebate-1', 2, drawTieredRebate),
  T('compute-landed-cost-1', 3, drawLandedCost),
  T('compute-discount-chain-1', 2, drawDiscountChain),
  T('compute-fx-chain-1', 2, drawFxChain),
  T('compute-reel-takeoff-1', 2, drawReelTakeoff),
  T('compute-margin-price-1', 3, drawMarginPrice),
  T('compute-long-division-1', 2, drawLongDivision),
];
