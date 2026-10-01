import type { V4Summary } from './types.js';

/**
 * Build the /v1/submissions payload for a v4 run. The backend schema is shared with v3; boards
 * keep the two apart by testpack_version (v4 is "4.*"). Suite means become the category scores,
 * and the confidence bands, seed and speed ride in score_detail.
 */
export function v4Payload(
  s: V4Summary,
  who: { user_nickname?: string; config_tag?: string } = {},
): Record<string, unknown> {
  const slug = s.model.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-model';
  const category_scores: Record<string, number> = {};
  for (const [suite, v] of Object.entries(s.suite_scores)) if (v.n) category_scores[suite] = Math.round(v.mean * 10) / 10;
  return {
    model: { slug, display_name: s.model, provider: s.provider, provider_model: s.model },
    testpack_version: s.testpack_version,
    pipeline_score: Math.round(s.pipeline_score * 100) / 100,
    category_scores,
    score_detail: {
      testpack: 'v4',
      seed: s.seed,
      suite_scores: s.suite_scores,
      speed: s.speed,
      started_at: s.started_at,
      finished_at: s.finished_at,
    },
    cli_version: s.cli_version,
    hardware_tag: s.hardware_tag,
    ...(who.user_nickname ? { user_nickname: who.user_nickname } : {}),
    ...(who.config_tag ? { config_tag: who.config_tag } : {}),
    task_results: s.task_results.map((r) => ({
      task_id: r.task_id,
      category: r.suite,
      task_input: '',
      model_output: (r.response ?? '').slice(0, 100_000),
      judge_score: r.score,
      passed: r.score >= 1,
      latency_ms: Math.round(r.latency_ms),
      tokens_used: r.tokens_out ?? null,
      judge_rationale: (r.detail ?? '').slice(0, 10_000),
    })),
  };
}

/** Why a run must not go on the board, or null when it is complete. */
export function v4SubmitBlocker(s: V4Summary): string | null {
  if (s.aborted) return `the run stopped early (${s.aborted})`;
  if (s.provider_errors?.length) return `${s.provider_errors.length} task(s) hit provider errors: ${s.provider_errors.join(', ')}. Rerun them with --only first.`;
  if (!s.testpack_version.startsWith('4.')) return `testpack ${s.testpack_version} is not a v4 testpack`;
  return null;
}

export async function submitV4(
  s: V4Summary,
  opts: { backend: string; site: string; user_nickname?: string; config_tag?: string },
): Promise<string> {
  const blocker = v4SubmitBlocker(s);
  if (blocker) throw new Error(`Not submitted: ${blocker}`);
  const res = await fetch(`${opts.backend}/v1/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(v4Payload(s, opts)),
  });
  if (!res.ok) throw new Error(`Submission failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as { id?: string; url?: string };
  const path = data.url ?? (data.id ? `/s/${data.id}` : '');
  return path.startsWith('http') ? path : `${opts.site}${path}`;
}
