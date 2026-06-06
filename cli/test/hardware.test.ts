/**
 * Run with: npm test
 * Pure-function assertions plus a live detection check on this machine.
 */
import {
  normalizeChipName,
  normalizeGpuName,
  roundRamGb,
  parseParamCount,
  estimateModelMemoryGb,
  checkModelFit,
  detectHardware,
} from '../src/hardware.js';

let failures = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  if (!ok) failures += 1;
}
function ok(name: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${detail}`}`);
  if (!cond) failures += 1;
}

// chip / gpu normalization
eq('chip Apple M3 Max', normalizeChipName('Apple M3 Max'), 'm3-max');
eq('chip Apple M2 Ultra', normalizeChipName('Apple M2 Ultra'), 'm2-ultra');
eq('chip AMD Ryzen 9 7950X', normalizeChipName('AMD Ryzen 9 7950X'), 'ryzen-9-7950x');
eq('chip Intel i9', normalizeChipName('Intel(R) Core(TM) i9-13900K CPU @ 3.00GHz'), 'i9-13900k');
eq('gpu RTX 4090', normalizeGpuName('NVIDIA GeForce RTX 4090'), 'rtx-4090');
eq('gpu A100', normalizeGpuName('NVIDIA A100-SXM4-80GB'), 'a100-sxm4-80gb');

// RAM rounding (bytes -> GB, snapped to common sizes)
eq('ram 128GiB', roundRamGb(128 * 1024 ** 3), 128);
eq('ram ~64GiB', roundRamGb(63.9 * 1024 ** 3), 64);
eq('ram 18GB snaps to 16', roundRamGb(18 * 1024 ** 3), 16);

// param parsing
eq('param 70b', parseParamCount('llama-3.3-70b'), 70);
eq('param 7b', parseParamCount('qwen2.5-7b-instruct'), 7);
eq('param 3.8b', parseParamCount('phi-3.8b'), 3.8);
eq('param frontier null', parseParamCount('claude-opus-4-7'), null);
eq('param gpt-4o null', parseParamCount('gpt-4o-mini'), null);

// memory estimate (q4 default, ~20% overhead)
eq('est 70b q4', estimateModelMemoryGb('llama-3.3-70b'), 46);
eq('est 8b q4', estimateModelMemoryGb('llama-3.1-8b'), 5);
eq('est frontier null', estimateModelMemoryGb('gpt-4o'), null);

// fit checks
const big = checkModelFit('llama-3.3-70b', { tag: 'x', totalRamGb: 16, vramGb: null });
ok('70b does not fit 16GB', big != null && big.fits === false, JSON.stringify(big));
const small = checkModelFit('llama-3.1-8b', { tag: 'x', totalRamGb: 64, vramGb: null });
ok('8b fits 64GB', small != null && small.fits === true, JSON.stringify(small));
ok('frontier model -> no check', checkModelFit('claude-opus-4-7', { tag: null, totalRamGb: 64, vramGb: null }) === null);
const vram = checkModelFit('llama-3.3-70b', { tag: 'rtx-4090-24gb', totalRamGb: 128, vramGb: 24 });
ok('uses VRAM budget when present', vram != null && vram.budgetKind === 'vram' && vram.fits === false, JSON.stringify(vram));

// live detection on this machine
const hw = detectHardware();
console.log(`\nlive detect: tag=${hw.tag} ram=${hw.totalRamGb}GB vram=${hw.vramGb}`);
ok('live tag is a non-empty slug', !!hw.tag && /^[a-z0-9._-]{2,60}$/.test(hw.tag), `tag=${hw.tag}`);
ok('live ram > 0', hw.totalRamGb > 0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
