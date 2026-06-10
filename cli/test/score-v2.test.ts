// Unit tests for the v2 scoring engine (pure functions, no model calls).
// Run: npx tsx test/score-v2.test.ts
import { readFileSync } from 'node:fs';
import { categoryScore, speedScore, scoreRun, t95, median } from '../src/score.js';
import type { TaskResult, Taxonomy } from '../src/types.js';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const taxonomy: Taxonomy = JSON.parse(
  readFileSync(new URL('../../benchmarks/taxonomy.json', import.meta.url), 'utf8'),
) as Taxonomy;

function tr(category: string, raw: number, extra: Partial<TaskResult> = {}): TaskResult {
  return {
    task_id: Math.random().toString(36).slice(2),
    category: category as TaskResult['category'],
    prompt: 'p',
    response: 'r',
    raw_score: raw,
    passed: raw >= 7,
    latency_ms: 1000,
    ...extra,
  };
}

// 1. t-critical values
check('t95(4) is the small-sample multiplier', t95(4) === 2.776, `got ${t95(4)}`);
check('t95(large) is the normal approx', t95(100) === 1.96, `got ${t95(100)}`);

// 2. zero-variance category → tight band
const tight = categoryScore([80, 80, 80, 80, 80].map((x) => ({ x, withinStd: 0 })));
check('zero-variance mean is exact', tight.mean === 80);
check('zero-variance band collapses', tight.ci_low === 80 && tight.ci_high === 80, JSON.stringify(tight));

// 3. high-variance category → wider band, same mean
const noisy = categoryScore([60, 100, 60, 100, 80].map((x) => ({ x, withinStd: 0 })));
check('noisy mean still 80', noisy.mean === 80, `got ${noisy.mean}`);
check('noisy band is wide', noisy.ci_high - noisy.ci_low > 30, `width ${noisy.ci_high - noisy.ci_low}`);

// 4. more tasks → narrower band (band shrinks ~1/sqrt(n))
const few = categoryScore(Array.from({ length: 5 }, (_, i) => ({ x: i % 2 ? 100 : 60, withinStd: 0 })));
const many = categoryScore(Array.from({ length: 21 }, (_, i) => ({ x: i % 2 ? 100 : 60, withinStd: 0 })));
check('band narrows with more tasks', (many.ci_high - many.ci_low) < (few.ci_high - few.ci_low),
  `many ${(many.ci_high - many.ci_low).toFixed(1)} vs few ${(few.ci_high - few.ci_low).toFixed(1)}`);

// 5. judge uncertainty widens the band (law of total variance)
const certain = categoryScore([80, 80, 80].map((x) => ({ x, withinStd: 0 })));
const uncertain = categoryScore([80, 80, 80].map((x) => ({ x, withinStd: 20 })));
check('judge spread widens the band', (uncertain.ci_high - uncertain.ci_low) > (certain.ci_high - certain.ci_low));

// 6. throughput speed: 100 tok in 1000ms = 100 tok/s = full marks at target 100
const spd = speedScore(
  Array.from({ length: 5 }, () => tr('code', 8, { tokens_out: 100, latency_ms: 1000 })),
  taxonomy,
);
check('throughput scored', spd.scored && spd.tps_p50 === 100 && spd.speed_score === 100, JSON.stringify(spd));

// 6b. length independence: longer output at the same RATE scores the same
const spdLong = speedScore(
  Array.from({ length: 5 }, () => tr('code', 8, { tokens_out: 800, latency_ms: 8000 })),
  taxonomy,
);
check('speed is length-independent (rate)', spdLong.speed_score === spd.speed_score, JSON.stringify(spdLong));

// 7. unscored when too few token-bearing samples
const spdNone = speedScore([tr('code', 8), tr('code', 8)], taxonomy);
check('speed unscored without token data', spdNone.scored === false && spdNone.speed_score === null);

// 8. per-profile composites diverge by use case
const results: TaskResult[] = [
  ...Array.from({ length: 3 }, () => tr('code', 10, { tokens_out: 50, latency_ms: 1000 })),
  ...Array.from({ length: 3 }, () => tr('reason', 5, { tokens_out: 50, latency_ms: 1000 })),
  ...Array.from({ length: 3 }, () => tr('write', 2, { tokens_out: 50, latency_ms: 1000 })),
  ...Array.from({ length: 3 }, () => tr('tool_use', 5, { tokens_out: 50, latency_ms: 1000 })),
  ...Array.from({ length: 3 }, () => tr('rag', 5, { tokens_out: 50, latency_ms: 1000 })),
];
const v2 = scoreRun(results, taxonomy);
check('coding profile rewards the code-strong model over writing profile',
  v2.profile_scores.coding > v2.profile_scores.writing,
  `coding ${v2.profile_scores.coding} vs writing ${v2.profile_scores.writing}`);
check('composite carries a confidence band', v2.pipeline_ci_high >= v2.pipeline_score && v2.pipeline_ci_low <= v2.pipeline_score);
check('category detail present with n', v2.category_detail.code?.n === 3, JSON.stringify(v2.category_detail.code));
check('default profile is balanced', v2.profile === 'balanced');

// 9. median helper
check('median odd', median([3, 1, 2]) === 2);
check('median even', median([1, 2, 3, 4]) === 2.5);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
