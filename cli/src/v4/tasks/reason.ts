import type { Rng, V4Task } from '../types.js';
import { finalLine } from '../util.js';

function finalNumber(text: string): number | null {
  const m = finalLine(text).match(/^Final:\s*\$?(-?[\d,]+(?:\.\d+)?)/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

const FORMAT = 'Show your working, then end with a last line of exactly "Final: <number>" and nothing after it.';

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);

// Rejection-sample until every quantity in the solution is a whole number, so
// each seed gets a different instance with a clean integer answer.
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

// Two pipes and a drain with a mid-way change: forces tracking state across phases.
export const reasonTank: V4Task = {
  id: 'reason-tank-phases-1',
  suite: 'reason',
  difficulty: 3,
  build(rng) {
    const { cap, a, b, drain, t1, answer } = drawTank(rng);
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `A ${cap}-litre tank starts empty. Pipe A alone fills it in ${a} minutes; pipe B alone fills it in ${b} minutes. ` +
          `A drain removes ${drain} litres per minute whenever it is open. All three start together. After ${t1} minutes pipe A breaks and stops for good, ` +
          `while B and the drain keep running. How many more minutes until the tank is full? ${FORMAT}`,
      }],
      grade(res) {
        const got = finalNumber(res.text);
        return got !== null && Math.abs(got - answer) < 1e-6
          ? { score: 1, detail: `Final: ${got}` }
          : { score: 0, detail: `want ${answer}, got ${got ?? `"${finalLine(res.text).slice(0, 60)}"`}` };
      },
    };
  },
};
