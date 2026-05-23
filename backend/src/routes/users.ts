import { Router } from 'express';
import { db } from '../db.js';
import { stamp, toIsoDate } from '../lib/api-version.js';

const router: Router = Router();

const SORT_COLUMNS: Record<string, string> = {
  score: 's.pipeline_score',
  date: 's.created_at',
  user: 's.user_nickname',
  model: 'm.display_name',
  provider: 'm.provider',
  tier: 's.pipeline_score', // tier follows from score, so sorting by score == tier
};

// ---- /v1/leaderboard/users ----------------------------------------------------
// Long, sortable, filterable feed of submissions w/ user nicknames.
// cpu.userbenchmark.com analogue.
router.get('/v1/leaderboard/users', (req, res) => {
  const q = req.query;
  const provider = typeof q.provider === 'string' ? q.provider : undefined;
  const tier = typeof q.tier === 'string' ? q.tier.toLowerCase() : undefined;
  const user = typeof q.user === 'string' ? q.user : undefined;
  const labVerified = q.lab_verified === '1' || q.lab_verified === 'true';
  const sort = typeof q.sort === 'string' && SORT_COLUMNS[q.sort] ? q.sort : 'score';
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(parseInt((q.limit as string) ?? '100', 10) || 100, 500);
  const offset = Math.max(parseInt((q.offset as string) ?? '0', 10) || 0, 0);
  const days = Math.min(parseInt((q.days as string) ?? '365', 10) || 365, 3650);

  const where: string[] = [`s.created_at >= datetime('now', ?)`, `s.user_nickname IS NOT NULL`];
  const params: unknown[] = [`-${days} days`];

  if (provider) { where.push('m.provider = ?'); params.push(provider); }
  if (tier) { where.push('LOWER(s.tier) = ?'); params.push(tier); }
  if (user) { where.push('s.user_nickname = ?'); params.push(user); }
  if (labVerified) { where.push('s.lab_verified = 1'); }

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM submissions s JOIN models m ON s.model_id = m.id WHERE ${where.join(' AND ')}`
    )
    .get(...params) as { c: number };

  const sortCol = SORT_COLUMNS[sort];
  const sql = `
    SELECT s.id, s.pipeline_score, s.tier, s.category_scores, s.lab_verified, s.user_nickname, s.config_tag, s.created_at, s.cli_version,
           m.slug AS model_slug, m.display_name AS model_display_name, m.provider AS model_provider, m.family AS model_family
    FROM submissions s
    JOIN models m ON s.model_id = m.id
    WHERE ${where.join(' AND ')}
    ORDER BY ${sortCol} ${dir}, s.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(sql).all(...params, limit, offset) as Array<Record<string, unknown>>;

  const entries = rows.map((r) => ({
    submission_id: r.id as string,
    pipeline_score: r.pipeline_score as number,
    tier: r.tier as string,
    category_scores: JSON.parse(r.category_scores as string) as Record<string, number>,
    lab_verified: Boolean(r.lab_verified),
    user_nickname: r.user_nickname as string,
    config_tag: (r.config_tag as string | null) ?? null,
    created_at: toIsoDate(r.created_at as string),
    cli_version: r.cli_version as string,
    model: {
      slug: r.model_slug as string,
      display_name: r.model_display_name as string,
      provider: r.model_provider as string,
      family: r.model_family as string | null,
    },
  }));

  res.json(stamp({
    total: countRow.c,
    count: entries.length,
    limit,
    offset,
    filters: { provider, tier, user, lab_verified: labVerified, days, sort, dir },
    entries,
  }));
});

// ---- /v1/users/:nickname -----------------------------------------------------
// Per-user dashboard: best score, all submissions, models attempted, category leaders.
router.get('/v1/users/:nickname', (req, res) => {
  const nick = req.params.nickname;
  if (!nick) return res.status(400).json(stamp({ error: 'missing_nickname' }));

  const subs = db
    .prepare(
      `SELECT s.id, s.pipeline_score, s.tier, s.category_scores, s.lab_verified, s.config_tag, s.created_at, s.cli_version,
              m.slug AS model_slug, m.display_name AS model_display_name, m.provider AS model_provider, m.family AS model_family
       FROM submissions s
       JOIN models m ON s.model_id = m.id
       WHERE s.user_nickname = ?
       ORDER BY s.pipeline_score DESC, s.created_at DESC`
    )
    .all(nick) as Array<Record<string, unknown>>;

  if (subs.length === 0) {
    return res.status(404).json(stamp({ error: 'user_not_found', nickname: nick }));
  }

  const entries = subs.map((r) => ({
    submission_id: r.id as string,
    pipeline_score: r.pipeline_score as number,
    tier: r.tier as string,
    category_scores: JSON.parse(r.category_scores as string) as Record<string, number>,
    lab_verified: Boolean(r.lab_verified),
    config_tag: (r.config_tag as string | null) ?? null,
    created_at: toIsoDate(r.created_at as string),
    cli_version: r.cli_version as string,
    model: {
      slug: r.model_slug as string,
      display_name: r.model_display_name as string,
      provider: r.model_provider as string,
      family: r.model_family as string | null,
    },
  }));

  // Per-model best: highest pipeline_score per model_slug.
  const bestPerModel: Record<string, typeof entries[number]> = {};
  for (const e of entries) {
    const cur = bestPerModel[e.model.slug];
    if (!cur || e.pipeline_score > cur.pipeline_score) bestPerModel[e.model.slug] = e;
  }
  const modelsTried = Object.values(bestPerModel).sort((a, b) => b.pipeline_score - a.pipeline_score);

  const best = entries[0]; // already sorted DESC
  const submissionCount = entries.length;
  const avgScore =
    Math.round((entries.reduce((s, e) => s + e.pipeline_score, 0) / submissionCount) * 100) / 100;

  // Provider distribution
  const providerCounts: Record<string, number> = {};
  for (const e of entries) {
    providerCounts[e.model.provider] = (providerCounts[e.model.provider] ?? 0) + 1;
  }

  // First-seen — find min on the raw entries (already ISO at this point)
  const firstSeen = entries.reduce(
    (min, e) => ((e.created_at ?? '') < (min ?? '') ? e.created_at : min),
    entries[0].created_at
  );

  res.json(stamp({
    nickname: nick,
    submission_count: submissionCount,
    best_score: best.pipeline_score,
    best_tier: best.tier,
    best_model: best.model,
    avg_score: avgScore,
    models_tried: modelsTried,
    provider_counts: providerCounts,
    first_seen: firstSeen,
    submissions: entries,
  }));
});

// ---- /v1/users (directory) ---------------------------------------------------
// Top users by best score. Useful for "Top Reviewers" panels.
router.get('/v1/users', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT user_nickname, COUNT(*) AS submission_count, MAX(pipeline_score) AS best_score
       FROM submissions
       WHERE user_nickname IS NOT NULL
       GROUP BY user_nickname
       ORDER BY best_score DESC
       LIMIT 200`
    )
    .all() as Array<{ user_nickname: string; submission_count: number; best_score: number }>;

  res.json(stamp({ count: rows.length, users: rows }));
});

export default router;
