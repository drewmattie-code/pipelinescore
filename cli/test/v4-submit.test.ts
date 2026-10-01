import { describe, it, expect } from 'vitest';
import { v4Payload, v4SubmitBlocker } from '../src/v4/submit.js';
import type { V4Summary } from '../src/v4/types.js';

const base = {
  testpack_version: '4.0.0-alpha.3', seed: 'launch1', model: 'muse-glimmer:30b', provider: 'local', hardware_tag: 'm5-max-48gb',
  cli_version: '0.5.0', pipeline_score: 71.234,
  suite_scores: { code: { mean: 90, ci_low: 80, ci_high: 100, n: 20 }, repo: { mean: 50, ci_low: 0, ci_high: 100, n: 4 }, agent: { mean: 0, ci_low: 0, ci_high: 0, n: 0 } },
  speed: { tps_p50: 31, total_tokens_out: 1000, wall_s: 600 },
  task_results: [{ task_id: 'code-x-1', suite: 'code', score: 1, detail: '16/16', response: 'def f(): pass', turns: 1, latency_ms: 1200.6, tokens_in: 10, tokens_out: 20 }],
  started_at: '2026-10-01T00:00:00Z', finished_at: '2026-10-01T00:10:00Z',
} as unknown as V4Summary;

describe('v4 submission payload', () => {
  it('maps suites to category scores, skipping empty ones, and keeps the bands in score_detail', () => {
    const p = v4Payload(base, { user_nickname: 'drew' }) as Record<string, any>;
    expect(p.model.slug).toBe('muse-glimmer-30b');
    expect(p.testpack_version).toBe('4.0.0-alpha.3');
    expect(p.pipeline_score).toBe(71.23);
    expect(p.category_scores).toEqual({ code: 90, repo: 50 });
    expect(p.score_detail.suite_scores.code.ci_low).toBe(80);
    expect(p.task_results[0]).toMatchObject({ task_id: 'code-x-1', category: 'code', passed: true, latency_ms: 1201 });
    expect(p.user_nickname).toBe('drew');
  });
  it('refuses incomplete or non-v4 runs', () => {
    expect(v4SubmitBlocker(base)).toBeNull();
    expect(v4SubmitBlocker({ ...base, aborted: 'x' })).toMatch(/stopped early/);
    expect(v4SubmitBlocker({ ...base, provider_errors: ['a'] })).toMatch(/provider errors/);
    expect(v4SubmitBlocker({ ...base, testpack_version: '2026-06-10-v3' })).toMatch(/not a v4/);
  });
});
