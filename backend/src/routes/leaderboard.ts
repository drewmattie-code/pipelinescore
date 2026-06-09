import { Router } from 'express';
import { db } from '../db.js';
import { stamp, toIsoDate } from '../lib/api-version.js';

const router: Router = Router();

router.get('/v1/leaderboard', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
  const labVerified = req.query.lab_verified === '1' || req.query.lab_verified === 'true';
  const limit = Math.max(1, Math.min(parseInt((req.query.limit as string) ?? '50', 10) || 50, 200));
  const days = Math.max(1, Math.min(parseInt((req.query.days as string) ?? '30', 10) || 30, 365));

  // Pull recent submissions (last N days) joined w/ models.
  const where: string[] = [`s.created_at >= datetime('now', ?)`];
  const params: unknown[] = [`-${days} days`];

  if (provider) {
    where.push(`m.provider = ?`);
    params.push(provider);
  }
  if (labVerified) {
    where.push(`s.lab_verified = 1`);
  }
  // When a category is requested, filter and rank by that category's score IN
  // SQL via json_extract. The old code took the top-N by OVERALL score and then
  // filtered in memory, so a model strong in one category but mid-pack overall
  // was wrongly dropped from the category board. The path is a bound parameter,
  // so this stays injection-safe.
  if (category) {
    where.push(`json_extract(s.category_scores, '$.' || ?) IS NOT NULL`);
    params.push(category);
  }

  const orderBy = category ? `json_extract(s.category_scores, '$.' || ?) DESC` : `s.pipeline_score DESC`;
  if (category) params.push(category);

  const sql = `
    SELECT s.id, s.pipeline_score, s.tier, s.category_scores, s.lab_verified, s.user_nickname, s.created_at,
           m.slug AS model_slug, m.display_name AS model_display_name, m.provider AS model_provider,
           m.family AS model_family
    FROM submissions s
    JOIN models m ON s.model_id = m.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  const entries = rows.map((r) => {
    const cs = JSON.parse(r.category_scores as string) as Record<string, number>;
    return {
      submission_id: r.id,
      pipeline_score: r.pipeline_score,
      tier: r.tier,
      category_scores: cs,
      lab_verified: Boolean(r.lab_verified),
      user_nickname: (r.user_nickname as string | null) ?? null,
      created_at: toIsoDate(r.created_at as string),
      model: {
        slug: r.model_slug,
        display_name: r.model_display_name,
        provider: r.model_provider,
        family: r.model_family,
      },
    };
  });

  res.json(stamp({
    count: entries.length,
    filters: { category, provider, lab_verified: labVerified, days, limit },
    entries,
  }));
});

export default router;
