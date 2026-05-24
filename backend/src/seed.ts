import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, uid } from './db.js';
import { tierForScore } from './lib/tier.js';
import { LOCAL_MODELS, HARDWARE_POOL, type LocalSeedModel } from './seed-local-models.js';

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

// Realistic dev nicknames — what you'd actually see if devs were submitting.
const SEED_NICKNAMES = [
  'karpathy_lite', 'goose-engineer', 'rust_witch', 'forklift', 'mira-shen',
  'devnull', 'pipelinepilot', 'dr_inference', 'tokenwrangler', 'shipfastly',
  'silicon-djinn', 'cli-native', 'haiku_or_die', 'opus-believer', 'gpt-cynic',
  'gemini-fan', 'localmodels', 'edge_runner', 'agentic_dad', 'context-window',
  'judgemental', 'rag-doll', 'tool-caller', 'reason-first', 'one-shot-only',
  'temp-zero', 'frontiermodel', 'open-weights', 'mistral-maxi', 'qwen-stan',
  'deepseek-wins', 'cohere-cult', 'llama-llama', 'kimi-curious', 'benchmark-rat',
];

function pickNickname(): string {
  return SEED_NICKNAMES[Math.floor(Math.random() * SEED_NICKNAMES.length)];
}

// Many more synthetic submissions per model so the user leaderboard has volume.
const SUBMISSIONS_PER_MODEL = 12;

// Plausible config_tags showing how the same base model gets customized.
// Empty means base/no-config — also the majority case.
const CONFIG_TAGS = [
  null, null, null, null, null,           // 5x weight on "no config" (base)
  'system-prompt-coder',
  'persona-pirate',
  'cot-style',
  'tools-enabled',
  'rag-prepend',
  'temp-zero',
  'lora-domain-finance',
];

function pickConfigTag(): string | null {
  return CONFIG_TAGS[Math.floor(Math.random() * CONFIG_TAGS.length)];
}

// Hardware tags people would actually use. Heavy on consumer rigs.
const HARDWARE_TAGS = [
  null, null,                              // some folks don't tag their hardware
  'm3-max-128gb',
  'm2-ultra-192gb',
  'm4-pro-48gb',
  'rtx-4090-24gb',
  'rtx-3090-24gb',
  'rtx-3080-10gb',
  'a100-80gb',
  'h100-80gb',
  'ryzen-7950x-cpu-only',
  'ryzen-5950x-rtx-3060',
  'cloud-api',                             // no local hardware — pure API
  'cloud-api',                             // 2x weight: most cloud runs
];

function pickHardwareTag(): string | null {
  return HARDWARE_TAGS[Math.floor(Math.random() * HARDWARE_TAGS.length)];
}

// Backfill: any submission missing a user_nickname gets one. Lab-verified rows get "lab".
function backfillNicknames(): void {
  const missing = db
    .prepare(
      `SELECT id, lab_verified FROM submissions WHERE user_nickname IS NULL OR user_nickname = ''`
    )
    .all() as Array<{ id: string; lab_verified: number }>;
  if (missing.length === 0) return;
  console.log(`[seed] backfilling user_nickname on ${missing.length} existing submissions`);
  const update = db.prepare(`UPDATE submissions SET user_nickname = ? WHERE id = ?`);
  const txn = db.transaction(() => {
    for (const row of missing) {
      const nick = row.lab_verified ? 'lab' : pickNickname();
      update.run(nick, row.id);
    }
  });
  txn();
}

export function seedIfEmpty(): void {
  backfillNicknames();
  const modelCount = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c;
  if (modelCount > 0) return;

  console.log(`[seed] empty DB — seeding ${MODELS.length} models + ${MODELS.length * SUBMISSIONS_PER_MODEL} submissions`);

  const insertModel = db.prepare(`
    INSERT INTO models (id, slug, display_name, provider, provider_model, family, released_at, context_window, metadata)
    VALUES (@id, @slug, @display_name, @provider, @provider_model, @family, @released_at, @context_window, @metadata)
  `);

  const insertSubmission = db.prepare(`
    INSERT INTO submissions (id, model_id, testpack_version, pipeline_score, tier, category_scores, raw_transcripts, cli_version, submitter_ip, user_nickname, config_tag, hardware_tag, lab_verified, notes, created_at)
    VALUES (@id, @model_id, @testpack_version, @pipeline_score, @tier, @category_scores, @raw_transcripts, @cli_version, @submitter_ip, @user_nickname, @config_tag, @hardware_tag, @lab_verified, @notes, @created_at)
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

    // 120 submissions distributed across 10 models = 12 each
    for (const m of MODELS) {
      for (let i = 0; i < SUBMISSIONS_PER_MODEL; i++) {
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
          user_nickname: i === 0 ? 'lab' : pickNickname(),
          config_tag: i === 0 ? null : pickConfigTag(),
          hardware_tag: i === 0 ? 'lab-baseline' : pickHardwareTag(),
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

// ----------------------------------------------------------------------------
// augmentIfMissing — non-destructive seed expansion.
//
// Adds models from LOCAL_MODELS that aren't already in the DB, plus a small
// set of synthetic hardware-distributed submissions per new model. Does NOT
// touch existing models or user submissions, so it's safe to call on every
// boot — including over a populated persistent disk.
//
// This is how we keep the launch leaderboard populated as the LM Studio /
// Ollama trending list shifts — drop new entries into seed-local-models.ts,
// next deploy adds them, existing data stays intact.
// ----------------------------------------------------------------------------

// Synthetic hardware-typical submitters. Different from SEED_NICKNAMES so it's
// easy to tell apart at audit time, while still looking community-natural.
const HW_SUBMITTERS = [
  'rig-tester', 'gpu-shopper', 'bench-rat', 'mac-stack', 'gguf-pilgrim',
  'mlx-mike', 'quant-or-die', 'sram-hoarder', 'flash-attn-fan', 'vram-monk',
  'cpu-only-prophet', 'apple-silicon', 'cuda-cult', 'rocm-rider', 'tensor-tomas',
  'edge-deployer', 'inference-monk', 'local-llama-fan', 'tps-counter', 'midnight-bencher',
];

function pickHardwareForSize(sc: LocalSeedModel['size_class']): string {
  const pool = HARDWARE_POOL[sc];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickSubmitter(): string {
  return HW_SUBMITTERS[Math.floor(Math.random() * HW_SUBMITTERS.length)];
}

// How many sample submissions per newly-added model. Mix of hardware variants
// so the leaderboard shows the same model across multiple rigs.
const SAMPLES_PER_NEW_MODEL = 4;

export function augmentIfMissing(): void {
  const existing = new Set(
    (db.prepare('SELECT slug FROM models').all() as Array<{ slug: string }>).map((r) => r.slug)
  );
  const missing = LOCAL_MODELS.filter((m) => !existing.has(m.slug));
  if (missing.length === 0) {
    return;
  }
  console.log(
    `[augment] adding ${missing.length} new models + ${missing.length * SAMPLES_PER_NEW_MODEL} sample submissions`
  );

  const insertModel = db.prepare(`
    INSERT INTO models (id, slug, display_name, provider, provider_model, family, released_at, context_window, metadata)
    VALUES (@id, @slug, @display_name, @provider, @provider_model, @family, @released_at, @context_window, @metadata)
  `);

  const insertSubmission = db.prepare(`
    INSERT INTO submissions (id, model_id, testpack_version, pipeline_score, tier, category_scores, raw_transcripts, cli_version, submitter_ip, user_nickname, config_tag, hardware_tag, lab_verified, notes, created_at)
    VALUES (@id, @model_id, @testpack_version, @pipeline_score, @tier, @category_scores, @raw_transcripts, @cli_version, @submitter_ip, @user_nickname, @config_tag, @hardware_tag, @lab_verified, @notes, @created_at)
  `);

  const insertTaskResult = db.prepare(`
    INSERT INTO task_results (id, submission_id, task_id, category, task_input, model_output, judge_score, passed, latency_ms, tokens_used, judge_rationale)
    VALUES (@id, @submission_id, @task_id, @category, @task_input, @model_output, @judge_score, @passed, @latency_ms, @tokens_used, @judge_rationale)
  `);

  const tasks = loadTasks();

  const txn = db.transaction(() => {
    for (const m of missing) {
      const modelId = uid();
      insertModel.run({
        id: modelId,
        slug: m.slug,
        display_name: m.display_name,
        provider: m.provider,
        provider_model: m.provider_model,
        family: m.family,
        released_at: m.released_at,
        context_window: m.context_window,
        metadata: JSON.stringify({ size_class: m.size_class }),
      });

      // Generate SAMPLES_PER_NEW_MODEL submissions with distinct hardware tags
      // so the same model appears across multiple rigs on the leaderboard.
      const usedHardware = new Set<string>();
      for (let i = 0; i < SAMPLES_PER_NEW_MODEL; i++) {
        let hardware = pickHardwareForSize(m.size_class);
        // Try a couple times to get distinct hardware per row
        let tries = 0;
        while (usedHardware.has(hardware) && tries < 5) {
          hardware = pickHardwareForSize(m.size_class);
          tries++;
        }
        usedHardware.add(hardware);

        // Score wobbles around target; speed-category penalty for big models on consumer rigs
        const isConsumerRig = !hardware.includes('a100') && !hardware.includes('h100') && !hardware.includes('h200') && !hardware.includes('b200') && !hardware.includes('cloud-api') && !hardware.includes('dgx');
        const speedPenalty = (m.size_class === 'huge' && isConsumerRig) ? 12 : (m.size_class === 'large' && isConsumerRig) ? 6 : 0;
        const target = clamp(jitter(m.target_score, 4));
        const categoryScores = generateCategoryScores(target);
        categoryScores.speed = clamp(categoryScores.speed - speedPenalty);
        const finalScore = weightedScore(categoryScores);
        const tier = tierForScore(finalScore);
        const submissionId = uid();
        const createdAt = randomDaysAgoISO(45);

        insertSubmission.run({
          id: submissionId,
          model_id: modelId,
          testpack_version: '2026-05-23-v1',
          pipeline_score: finalScore,
          tier,
          category_scores: JSON.stringify(categoryScores),
          raw_transcripts: JSON.stringify({ note: 'sample data — added by augmentIfMissing' }),
          cli_version: '0.1.0',
          submitter_ip: 'seed',
          user_nickname: i === 0 ? 'lab' : pickSubmitter(),
          config_tag: null,
          hardware_tag: i === 0 ? `lab-${hardware}` : hardware,
          lab_verified: i === 0 ? 1 : 0,
          notes: i === 0 ? 'Lab-verified canonical run' : null,
          created_at: createdAt,
        });

        // Speed in tok/sec varies hugely by hardware. Approximate latency:
        //   huge model on consumer rig: 2000-4000ms/task
        //   medium model on m3 max:     400-700ms/task
        //   small model on M1:          200-500ms/task
        const baseLatency =
          m.size_class === 'huge' ? (isConsumerRig ? 3000 : 900)
          : m.size_class === 'large' ? (isConsumerRig ? 1500 : 600)
          : m.size_class === 'medium' ? (isConsumerRig ? 800 : 450)
          : 350;

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
            latency_ms: Math.floor(jitter(baseLatency, baseLatency * 0.3)),
            tokens_used: Math.floor(jitter(220, 120)),
            judge_rationale: passed ? 'Met rubric criteria.' : 'Missed key criterion.',
          });
        }
      }
    }
  });

  txn();
  console.log('[augment] done');
}
