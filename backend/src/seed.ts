import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, uid } from './db.js';
import { tierForScore } from './lib/tier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_PATH = resolve(__dirname, '..', '..', 'benchmarks', 'tasks-v1.json');

type SeedModel = {
  slug: string;
  display_name: string;
  provider: string;
  provider_model: string;
  family: string;
  released_at: string;
  context_window: number;
  // tier_target ~ where its pipeline score should land
  target_score: number;
};

const MODELS: SeedModel[] = [
  {
    slug: 'claude-opus-4-7',
    display_name: 'Claude Opus 4.7',
    provider: 'anthropic',
    provider_model: 'claude-opus-4-7-20260301',
    family: 'claude',
    released_at: '2026-03-01',
    context_window: 1_000_000,
    target_score: 91.5,
  },
  {
    slug: 'gpt-5-5',
    display_name: 'GPT-5.5',
    provider: 'openai',
    provider_model: 'gpt-5.5-2026-04',
    family: 'gpt',
    released_at: '2026-04-15',
    context_window: 512_000,
    target_score: 89.4,
  },
  {
    slug: 'gemini-2-5-pro',
    display_name: 'Gemini 2.5 Pro',
    provider: 'google',
    provider_model: 'gemini-2.5-pro',
    family: 'gemini',
    released_at: '2026-02-10',
    context_window: 2_000_000,
    target_score: 86.2,
  },
  {
    slug: 'claude-haiku-4-5',
    display_name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    provider_model: 'claude-haiku-4-5-20251001',
    family: 'claude',
    released_at: '2025-10-01',
    context_window: 200_000,
    target_score: 67.8,
  },
  {
    slug: 'llama-4-405b',
    display_name: 'Llama 4 405B',
    provider: 'meta',
    provider_model: 'llama-4-405b-instruct',
    family: 'llama',
    released_at: '2026-01-20',
    context_window: 128_000,
    target_score: 73.1,
  },
  {
    slug: 'mistral-large-2',
    display_name: 'Mistral Large 2',
    provider: 'mistral',
    provider_model: 'mistral-large-2-2026',
    family: 'mistral',
    released_at: '2026-02-28',
    context_window: 128_000,
    target_score: 78.6,
  },
  {
    slug: 'command-r-plus',
    display_name: 'Command R+',
    provider: 'cohere',
    provider_model: 'command-r-plus-08-2026',
    family: 'command',
    released_at: '2026-03-20',
    context_window: 128_000,
    target_score: 71.4,
  },
  {
    slug: 'qwen3-6-72b',
    display_name: 'Qwen 3.6 72B',
    provider: 'alibaba',
    provider_model: 'qwen3.6-72b-instruct',
    family: 'qwen',
    released_at: '2026-04-05',
    context_window: 256_000,
    target_score: 80.3,
  },
  {
    slug: 'deepseek-v4',
    display_name: 'DeepSeek V4',
    provider: 'deepseek',
    provider_model: 'deepseek-v4-2026-04',
    family: 'deepseek',
    released_at: '2026-04-22',
    context_window: 256_000,
    target_score: 82.7,
  },
  {
    slug: 'kimi-k2-7',
    display_name: 'Kimi K2.7',
    provider: 'moonshot',
    provider_model: 'kimi-k2.7',
    family: 'kimi',
    released_at: '2026-05-01',
    context_window: 200_000,
    target_score: 76.9,
  },
];

const CATEGORIES = ['code', 'reason', 'write', 'tool_use', 'rag', 'speed'] as const;
const WEIGHTS: Record<(typeof CATEGORIES)[number], number> = {
  code: 0.25,
  reason: 0.2,
  write: 0.15,
  tool_use: 0.15,
  rag: 0.12,
  speed: 0.13,
};

function jitter(center: number, spread: number): number {
  return center + (Math.random() * 2 - 1) * spread;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function generateCategoryScores(target: number): Record<string, number> {
  // distribute target across categories with small jitter, then normalize so weighted avg ≈ target
  const raw: Record<string, number> = {};
  for (const c of CATEGORIES) {
    raw[c] = clamp(jitter(target, 6));
  }
  // compute weighted avg
  let weighted = 0;
  for (const c of CATEGORIES) weighted += raw[c] * WEIGHTS[c];
  const delta = target - weighted;
  // apply correction uniformly
  for (const c of CATEGORIES) {
    raw[c] = clamp(raw[c] + delta);
  }
  // round to 1 decimal
  for (const c of CATEGORIES) raw[c] = Math.round(raw[c] * 10) / 10;
  return raw;
}

function weightedScore(scores: Record<string, number>): number {
  let total = 0;
  for (const c of CATEGORIES) total += scores[c] * WEIGHTS[c];
  return Math.round(total * 100) / 100;
}

type TaskDef = { id: string; category: string; prompt: string; difficulty: number };

function loadTasks(): TaskDef[] {
  const raw = JSON.parse(readFileSync(TASKS_PATH, 'utf-8')) as { tasks: TaskDef[] };
  return raw.tasks;
}

function fakeOutputFor(task: TaskDef, score: number): string {
  // Realistic-ish stub keyed to category
  const ok = score >= 60;
  switch (task.category) {
    case 'code':
      return ok
        ? `def fib(n):\n    a,b=0,1\n    for _ in range(n): a,b=b,a+b\n    return a`
        : `function ${task.id.replace(/-/g,'_')}() { /* TODO */ }`;
    case 'reason':
      return ok ? `Working through it...\n\nFinal: 4` : `I think the answer is 7.`;
    case 'write':
      return ok
        ? `In Q3, supply chain volatility eased as shipping rates normalized. Distributors reported margin recovery; inventory days returned to pre-disruption norms.`
        : `The thing went down then up.`;
    case 'tool_use':
      return ok
        ? `{"tool":"search","args":{"q":"current copper futures"}}`
        : `Let me think about which tool to call.`;
    case 'rag':
      return ok
        ? `According to the provided document [doc-2, §3], the threshold is 14 days.`
        : `I believe it's around two weeks but I'm not certain.`;
    case 'speed':
      return ok ? `OK.` : `OK.`;
    default:
      return 'response';
  }
}

function randomDaysAgoISO(maxDays: number): string {
  const days = Math.floor(Math.random() * maxDays);
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export function seedIfEmpty(): void {
  const modelCount = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c;
  if (modelCount > 0) return;

  console.log('[seed] empty DB — seeding 10 models + 30 submissions');

  const insertModel = db.prepare(`
    INSERT INTO models (id, slug, display_name, provider, provider_model, family, released_at, context_window, metadata)
    VALUES (@id, @slug, @display_name, @provider, @provider_model, @family, @released_at, @context_window, @metadata)
  `);

  const insertSubmission = db.prepare(`
    INSERT INTO submissions (id, model_id, testpack_version, pipeline_score, tier, category_scores, raw_transcripts, cli_version, submitter_ip, lab_verified, notes, created_at)
    VALUES (@id, @model_id, @testpack_version, @pipeline_score, @tier, @category_scores, @raw_transcripts, @cli_version, @submitter_ip, @lab_verified, @notes, @created_at)
  `);

  const insertTaskResult = db.prepare(`
    INSERT INTO task_results (id, submission_id, task_id, category, task_input, model_output, judge_score, passed, latency_ms, tokens_used, judge_rationale)
    VALUES (@id, @submission_id, @task_id, @category, @task_input, @model_output, @judge_score, @passed, @latency_ms, @tokens_used, @judge_rationale)
  `);

  const tasks = loadTasks();

  const modelIds: Record<string, string> = {};

  const txn = db.transaction(() => {
    for (const m of MODELS) {
      const id = uid();
      modelIds[m.slug] = id;
      insertModel.run({
        id,
        slug: m.slug,
        display_name: m.display_name,
        provider: m.provider,
        provider_model: m.provider_model,
        family: m.family,
        released_at: m.released_at,
        context_window: m.context_window,
        metadata: JSON.stringify({}),
      });
    }

    // 30 submissions distributed roughly evenly across 10 models = 3 each
    for (const m of MODELS) {
      for (let i = 0; i < 3; i++) {
        const submissionId = uid();
        const target = clamp(jitter(m.target_score, 1.5));
        const categoryScores = generateCategoryScores(target);
        const finalScore = weightedScore(categoryScores);
        const tier = tierForScore(finalScore);
        const createdAt = randomDaysAgoISO(28);

        insertSubmission.run({
          id: submissionId,
          model_id: modelIds[m.slug],
          testpack_version: '2026-05-23-v1',
          pipeline_score: finalScore,
          tier,
          category_scores: JSON.stringify(categoryScores),
          raw_transcripts: JSON.stringify({ note: 'seed data' }),
          cli_version: '0.1.0',
          submitter_ip: 'seed',
          lab_verified: i === 0 ? 1 : 0,
          notes: i === 0 ? 'Lab-verified canonical run' : null,
          created_at: createdAt,
        });

        // task_results: subset of 25 tasks
        for (const t of tasks) {
          const catScore = categoryScores[t.category as keyof typeof categoryScores] ?? target;
          const passed = Math.random() < catScore / 100 ? 1 : 0;
          const judgeScore = Math.round(clamp(jitter(catScore / 10, 1), 0, 10) * 10) / 10;
          insertTaskResult.run({
            id: uid(),
            submission_id: submissionId,
            task_id: t.id,
            category: t.category,
            task_input: t.prompt,
            model_output: fakeOutputFor(t, catScore),
            judge_score: judgeScore,
            passed,
            latency_ms: Math.floor(jitter(800, 600)),
            tokens_used: Math.floor(jitter(220, 120)),
            judge_rationale: passed ? 'Met rubric criteria.' : 'Missed key criterion.',
          });
        }
      }
    }
  });

  txn();
  console.log('[seed] done');
}
