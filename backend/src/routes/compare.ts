import { Router } from 'express';
import { db } from '../db.js';

const router: Router = Router();

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(slug: string) {
  const model = db.prepare('SELECT * FROM models WHERE slug = ?').get(slug) as
    | Record<string, unknown>
    | undefined;
  if (!model) return null;

  const subs = db
    .prepare(`SELECT pipeline_score, category_scores, lab_verified FROM submissions WHERE model_id = ?`)
    .all(model.id) as Array<Record<string, unknown>>;

  const pipelineScores = subs.map((s) => s.pipeline_score as number);
  const categoryAccum: Record<string, number[]> = {};
  for (const s of subs) {
    const cs = JSON.parse(s.category_scores as string) as Record<string, number>;
    for (const [k, v] of Object.entries(cs)) (categoryAccum[k] ??= []).push(v);
  }
  const medians: Record<string, number | null> = {};
  for (const [k, arr] of Object.entries(categoryAccum)) medians[k] = median(arr);

  return {
    slug: model.slug,
    display_name: model.display_name,
    provider: model.provider,
    family: model.family,
    submission_count: subs.length,
    median_pipeline_score: median(pipelineScores),
    median_category_scores: medians,
    best_pipeline_score: pipelineScores.length ? Math.max(...pipelineScores) : null,
    lab_verified_count: subs.filter((s) => s.lab_verified === 1).length,
  };
}

router.get('/v1/compare', (req, res) => {
  const a = req.query.a;
  const b = req.query.b;
  if (typeof a !== 'string' || typeof b !== 'string') {
    return res.status(400).json({ error: 'missing_params', detail: 'a and b query params required' });
  }

  const aSum = summarize(a);
  const bSum = summarize(b);
  if (!aSum) return res.status(404).json({ error: 'not_found', slug: a });
  if (!bSum) return res.status(404).json({ error: 'not_found', slug: b });

  // diff per category
  const allCats = new Set([
    ...Object.keys(aSum.median_category_scores),
    ...Object.keys(bSum.median_category_scores),
  ]);
  const diff: Record<string, { a: number | null; b: number | null; delta: number | null }> = {};
  for (const c of allCats) {
    const av = aSum.median_category_scores[c] ?? null;
    const bv = bSum.median_category_scores[c] ?? null;
    const delta = av !== null && bv !== null ? Math.round((av - bv) * 100) / 100 : null;
    diff[c] = { a: av, b: bv, delta };
  }

  let winner: 'a' | 'b' | 'tie' = 'tie';
  if (aSum.median_pipeline_score !== null && bSum.median_pipeline_score !== null) {
    if (aSum.median_pipeline_score > bSum.median_pipeline_score) winner = 'a';
    else if (bSum.median_pipeline_score > aSum.median_pipeline_score) winner = 'b';
  }

  res.json({ a: aSum, b: bSum, category_diff: diff, winner });
});

export default router;
