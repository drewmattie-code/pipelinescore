// Exact-compute suite: solver correctness, grading and formats.
// Run: npx tsx test/v4-compute.test.ts   (no model calls; needs python3 for the cross-check)
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskRng } from '../src/v4/rng.js';
import {
  COMPUTE_TASKS, dec, fmt, parseFinalExact, q, roundHalfUp, roundUpTo,
  drawBigMultiply, drawColumnTotal, drawTieredRebate, drawLandedCost, drawDiscountChain,
  drawFxChain, drawReelTakeoff, drawMarginPrice, drawLongDivision,
} from '../src/v4/tasks/compute.js';

let failures = 0;
const check = (name: string, ok: boolean, extra = '') => { if (!ok) { failures++; console.log(`FAIL ${name} ${extra}`); } };

// helpers, against hand-checked values
check('roundHalfUp .005 up', fmt(roundHalfUp(dec('6371.6085'), 2), 2) === '6371.61');
check('roundHalfUp .0049 down', fmt(roundHalfUp(dec('1.2349'), 2), 2) === '1.23');
check('roundHalfUp exact half', fmt(roundHalfUp(dec('2.345'), 2), 2) === '2.35');
check('roundUpTo nickel', fmt(roundUpTo(dec('61.926'), dec('0.05')), 2) === '61.95');
check('roundUpTo already multiple', fmt(roundUpTo(dec('61.95'), dec('0.05')), 2) === '61.95');
check('big product', fmt(q(123456789n * 987654321n), 0) === '121932631112635269');

// parser formats
const v = (s: string) => { const r = parseFinalExact(s); return r ? fmt(r, 2) : null; };
check('parse plain', v('work\nFinal: 1234.5') === '1234.50');
check('parse $ and commas', v('Final: $1,234.50') === '1234.50');
check('parse bold', v('**Final: 99.10**') === '99.10');
check('parse rejects words', v('Final: about 12') === null);
check('parse big int exact', (() => { const r = parseFinalExact('Final: 121932631112635269'); return !!r && r.n === 121932631112635269n && r.d === 1n; })());

// grading through the built task, every template, many seeds
const draws: Record<string, (r: ReturnType<typeof taskRng>) => { prompt: string; want: ReturnType<typeof q>; places: number }> = {
  'compute-big-multiply-1': drawBigMultiply, 'compute-column-total-1': drawColumnTotal, 'compute-tiered-rebate-1': drawTieredRebate,
  'compute-landed-cost-1': drawLandedCost, 'compute-discount-chain-1': drawDiscountChain, 'compute-fx-chain-1': drawFxChain,
  'compute-reel-takeoff-1': drawReelTakeoff, 'compute-margin-price-1': drawMarginPrice, 'compute-long-division-1': drawLongDivision,
};
const dump: Array<{ id: string; prompt: string; want: string; places: number }> = [];
for (const task of COMPUTE_TASKS) {
  check(`suite tag ${task.id}`, task.suite === 'compute');
  for (let i = 0; i < 60; i++) {
    const seed = `s${i}`;
    const { prompt, want, places } = draws[task.id](taskRng(seed, task.id));
    const inst = task.build(taskRng(seed, task.id));
    if (inst.kind !== 'single') { check(`${task.id} single`, false); continue; }
    const shown = fmt(want, places);
    const right = inst.grade({ text: `working...\nFinal: ${shown}` } as never) as { score: number };
    check(`${task.id} seed ${seed} right answer scores 1`, right.score === 1, shown);
    const offBy = places ? fmt(q(want.n * 10n ** BigInt(places) / want.d + 1n, 10n ** BigInt(places)), places) : (want.n / want.d + 1n).toString();
    const wrong = inst.grade({ text: `Final: ${offBy}` } as never) as { score: number };
    check(`${task.id} seed ${seed} off-by-one scores 0`, wrong.score === 0, offBy);
    check(`${task.id} prompt carries format`, inst.messages[0].content.includes('Final: <number>'));
    dump.push({ id: task.id, prompt, want: shown, places });
  }
}

// independent cross-check: Python's decimal module re-reads each prompt and recomputes
const dir = mkdtempSync(join(tmpdir(), 'ps-compute-'));
const file = join(dir, 'cases.json');
writeFileSync(file, JSON.stringify(dump));
const out = execFileSync('python3', [new URL('./compute_crosscheck.py', import.meta.url).pathname, file], { encoding: 'utf8' });
const bad = out.trim().split('\n').filter((l) => l.startsWith('MISMATCH'));
bad.slice(0, 10).forEach((l) => console.log(l));
check('python cross-check', bad.length === 0, `${bad.length} mismatches`);
console.log(out.trim().split('\n').at(-1));

console.log(failures ? `\n${failures} FAILED` : `\nall compute tests passed (${dump.length} cases cross-checked)`);
if (failures) process.exit(1);
