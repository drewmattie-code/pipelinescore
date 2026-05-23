import { Router } from 'express';
import { db } from '../db.js';

const router: Router = Router();

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

router.get('/v1/models/:slug', (req, res) => {
  const model = db.prepare('SELECT * FROM models WHERE slug = ?').get(req.params.slug) as
    | Record<string, unknown>
    | undefined;
  if (!model) return res.status(404).json({ error: 'not_found' });

  const subs = db
    .prepare(
      `SELECT id, pipeline_score, tier, category_scores, lab_verified, created_at
       FROM submissions WHERE model_id = ? ORDER BY created_at DESC`
    )
    .all(model.id) as Array<Record<string, unknown>>;

  const pipelineScores = subs.map((s) => s.pipeline_score as number);
  const categoryAccum: Record<string, number[]> = {};
  for (const s of subs) {
    const cs = JSON.parse(s.category_scores as string) as Record<string, number>;
    for (const [k, v] of Object.entries(cs)) {
      (categoryAccum[k] ??= []).push(v);
    }
  }
  const medians: Record<string, number | null> = {};
  for (const [k, arr] of Object.entries(categoryAccum)) medians[k] = median(arr);

  res.json({
    slug: model.slug,
    display_name: model.display_name,
    provider: model.provider,
    provider_model: model.provider_model,
    family: model.family,
    released_at: model.released_at,
    context_window: model.context_window,
    metadata: model.metadata ? JSON.parse(model.metadata as string) : {},
    stats: {
      submission_count: subs.length,
      median_pipeline_score: median(pipelineScores),
      median_category_scores: medians,
      best_pipeline_score: pipelineScores.length ? Math.max(...pipelineScores) : null,
    },
    recent_submissions: subs.slice(0, 10).map((s) => ({
      id: s.id,
      pipeline_score: s.pipeline_score,
      tier: s.tier,
      category_scores: JSON.parse(s.category_scores as string),
      lab_verified: Boolean(s.lab_verified),
      created_at: s.created_at,
    })),
  });
});

export default router;
