import { Router } from 'express';
import { db } from '../db.js';

const router: Router = Router();

router.get('/v1/leaderboard', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
  const labVerified = req.query.lab_verified === '1' || req.query.lab_verified === 'true';
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10) || 50, 200);
  const days = Math.min(parseInt((req.query.days as string) ?? '30', 10) || 30, 365);

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

  const sql = `
    SELECT s.id, s.pipeline_score, s.tier, s.category_scores, s.lab_verified, s.user_nickname, s.created_at,
           m.slug AS model_slug, m.display_name AS model_display_name, m.provider AS model_provider,
           m.family AS model_family
    FROM submissions s
    JOIN models m ON s.model_id = m.id
    WHERE ${where.join(' AND ')}
    ORDER BY s.pipeline_score DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  let entries = rows.map((r) => {
    const cs = JSON.parse(r.category_scores as string) as Record<string, number>;
    return {
      submission_id: r.id,
      pipeline_score: r.pipeline_score,
      tier: r.tier,
      category_scores: cs,
      lab_verified: Boolean(r.lab_verified),
      user_nickname: (r.user_nickname as string | null) ?? null,
      created_at: r.created_at,
      model: {
        slug: r.model_slug,
        display_name: r.model_display_name,
        provider: r.model_provider,
        family: r.model_family,
      },
    };
  });

  if (category) {
    entries = entries
      .filter((e) => category in e.category_scores)
      .sort((a, b) => b.category_scores[category] - a.category_scores[category]);
  }

  res.json({
    count: entries.length,
    filters: { category, provider, lab_verified: labVerified, days, limit },
    entries,
  });
});

export default router;
