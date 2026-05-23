import { Router } from 'express';
import { z } from 'zod';
import { db, uid } from '../db.js';
import { tierForScore } from '../lib/tier.js';

const router: Router = Router();

const ModelInput = z.object({
  slug: z.string().min(1),
  display_name: z.string().min(1),
  provider: z.string().min(1),
  provider_model: z.string().min(1),
  family: z.string().optional(),
  context_window: z.number().int().optional(),
  released_at: z.string().optional(),
});

const TaskResultInput = z.object({
  task_id: z.string(),
  category: z.string(),
  task_input: z.string(),
  model_output: z.string(),
  judge_score: z.number().nullable().optional(),
  passed: z.boolean().nullable().optional(),
  latency_ms: z.number().int().nullable().optional(),
  tokens_used: z.number().int().nullable().optional(),
  judge_rationale: z.string().nullable().optional(),
});

const SubmissionInput = z.object({
  model: ModelInput,
  testpack_version: z.string(),
  pipeline_score: z.number().min(0).max(100),
  tier: z.string().optional(),
  category_scores: z.record(z.string(), z.number()),
  task_results: z.array(TaskResultInput).default([]),
  raw_transcripts: z.unknown().optional(),
  cli_version: z.string(),
  user_nickname: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'nickname: alphanum + . _ - only')
    .optional(),
  notes: z.string().nullable().optional(),
});

function findOrCreateModel(input: z.infer<typeof ModelInput>): string {
  const existing = db.prepare('SELECT id FROM models WHERE slug = ?').get(input.slug) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;

  const id = uid();
  db.prepare(
    `INSERT INTO models (id, slug, display_name, provider, provider_model, family, released_at, context_window, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.slug,
    input.display_name,
    input.provider,
    input.provider_model,
    input.family ?? null,
    input.released_at ?? null,
    input.context_window ?? null,
    JSON.stringify({})
  );
  return id;
}

router.post('/v1/submissions', (req, res) => {
  const parsed = SubmissionInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }
  const body = parsed.data;

  try {
    const submissionId = uid();
    const txn = db.transaction(() => {
      const modelId = findOrCreateModel(body.model);
      const tier = body.tier ?? tierForScore(body.pipeline_score);

      db.prepare(
        `INSERT INTO submissions (id, model_id, testpack_version, pipeline_score, tier, category_scores, raw_transcripts, cli_version, submitter_ip, user_nickname, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        submissionId,
        modelId,
        body.testpack_version,
        body.pipeline_score,
        tier,
        JSON.stringify(body.category_scores),
        JSON.stringify(body.raw_transcripts ?? null),
        body.cli_version,
        req.ip ?? null,
        body.user_nickname ?? null,
        body.notes ?? null
      );

      const insertTask = db.prepare(
        `INSERT INTO task_results (id, submission_id, task_id, category, task_input, model_output, judge_score, passed, latency_ms, tokens_used, judge_rationale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const t of body.task_results) {
        insertTask.run(
          uid(),
          submissionId,
          t.task_id,
          t.category,
          t.task_input,
          t.model_output,
          t.judge_score ?? null,
          t.passed === undefined || t.passed === null ? null : t.passed ? 1 : 0,
          t.latency_ms ?? null,
          t.tokens_used ?? null,
          t.judge_rationale ?? null
        );
      }
    });
    txn();

    return res.status(201).json({ id: submissionId, url: `/s/${submissionId}` });
  } catch (err) {
    return res.status(500).json({ error: 'insert_failed', detail: (err as Error).message });
  }
});

router.get('/v1/submissions/:id', (req, res) => {
  const sub = db
    .prepare(
      `SELECT s.*, m.slug AS model_slug, m.display_name AS model_display_name, m.provider AS model_provider, m.provider_model AS model_provider_model, m.family AS model_family
       FROM submissions s JOIN models m ON s.model_id = m.id
       WHERE s.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!sub) return res.status(404).json({ error: 'not_found' });

  const tasks = db
    .prepare(`SELECT * FROM task_results WHERE submission_id = ? ORDER BY category, task_id`)
    .all(req.params.id);

  res.json({
    id: sub.id,
    model: {
      slug: sub.model_slug,
      display_name: sub.model_display_name,
      provider: sub.model_provider,
      provider_model: sub.model_provider_model,
      family: sub.model_family,
    },
    testpack_version: sub.testpack_version,
    pipeline_score: sub.pipeline_score,
    tier: sub.tier,
    category_scores: JSON.parse(sub.category_scores as string),
    cli_version: sub.cli_version,
    lab_verified: Boolean(sub.lab_verified),
    notes: sub.notes,
    created_at: sub.created_at,
    task_results: tasks,
  });
});

export default router;
