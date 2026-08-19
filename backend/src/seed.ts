import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACEHOLDER_NICKNAMES } from './lib/placeholder-nicknames.js';
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

// Foundation seed models — all downloadable open-weights you can pull from
// Ollama / LM Studio / Hugging Face. NO frontier API (Claude / GPT / Gemini)
// in the sample data, because those don't run on hardware tags like
// "m3-max-128gb" or "rtx-4090-24gb" — you only access them via cloud API.
// Keeping the sample leaderboard honest about what's actually local-runnable.
const MODELS: SeedModel[] = [
  // The 10 most popular local models 2026 — covers the size + family
  // distribution most likely to appear in real submissions.
  {
    slug: 'llama-3-3-70b-instruct',
    display_name: 'Llama 3.3 70B Instruct',
    provider: 'meta',
    provider_model: 'llama-3.3-70b-instruct',
    family: 'llama',
    released_at: '2024-12-06',
    context_window: 128_000,
    target_score: 81.6,
  },
  {
    slug: 'qwen-2-5-72b-instruct',
    display_name: 'Qwen 2.5 72B Instruct',
    provider: 'alibaba',
    provider_model: 'qwen2.5-72b-instruct',
    family: 'qwen',
    released_at: '2024-09-19',
    context_window: 131_072,
    target_score: 82.4,
  },
  {
    slug: 'qwen-2-5-32b-instruct',
    display_name: 'Qwen 2.5 32B Instruct',
    provider: 'alibaba',
    provider_model: 'qwen2.5-32b-instruct',
    family: 'qwen',
    released_at: '2024-09-19',
    context_window: 131_072,
    target_score: 78.6,
  },
  {
    slug: 'qwen-2-5-coder-32b',
    display_name: 'Qwen 2.5 Coder 32B',
    provider: 'alibaba',
    provider_model: 'qwen2.5-coder-32b',
    family: 'qwen',
    released_at: '2024-11-12',
    context_window: 131_072,
    target_score: 82.1,
  },
  {
    slug: 'deepseek-r1',
    display_name: 'DeepSeek R1 671B-A37B',
    provider: 'deepseek',
    provider_model: 'deepseek-r1',
    family: 'deepseek',
    released_at: '2025-01-20',
    context_window: 128_000,
    target_score: 86.4,
  },
  {
    slug: 'deepseek-v3',
    display_name: 'DeepSeek V3 671B-A37B',
    provider: 'deepseek',
    provider_model: 'deepseek-v3',
    family: 'deepseek',
    released_at: '2024-12-26',
    context_window: 128_000,
    target_score: 84.7,
  },
  {
    slug: 'mistral-nemo-12b-instruct',
    display_name: 'Mistral Nemo 12B Instruct',
    provider: 'mistral',
    provider_model: 'mistral-nemo-12b-instruct',
    family: 'mistral',
    released_at: '2024-07-18',
    context_window: 131_072,
    target_score: 68.2,
  },
  {
    slug: 'mixtral-8x22b-instruct',
    display_name: 'Mixtral 8x22B Instruct',
    provider: 'mistral',
    provider_model: 'mixtral-8x22b-instruct',
    family: 'mistral',
    released_at: '2024-04-10',
    context_window: 65_536,
    target_score: 78.3,
  },
  {
    slug: 'gemma-3-27b-it',
    display_name: 'Gemma 3 27B IT',
    provider: 'google',
    provider_model: 'gemma-3-27b-it',
    family: 'gemma',
    released_at: '2025-03-12',
    context_window: 131_072,
    target_score: 76.9,
  },
  {
    slug: 'phi-4',
    display_name: 'Phi 4 14B',
    provider: 'microsoft',
    provider_model: 'phi-4-14b',
    family: 'phi',
    released_at: '2024-12-12',
    context_window: 16_384,
    target_score: 71.6,
  },
];

// Closed-weights / API-only model slugs that should NEVER appear in the
// sample leaderboard (you can't download + run them on local hardware).
// purgeClosedModelsIfPresent() removes any of these from the DB on startup
// — fixes pre-existing seeds from before we tightened this rule.
const CLOSED_API_ONLY_SLUGS = [
  'claude-opus-4-7',
  'claude-opus-4-7-20250514',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'gpt-5-5',
  'gpt-5-5-2026-04',
  'gemini-2-5-pro',
  'gemini-2-0-pro',
  'kimi-k2-7', // Kimi K2.7 is API-only; earlier K2 weights were open but we want only confidently-downloadable in samples
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

// NOTE: a backfillNicknames() helper used to run here on every boot, stamping
// a random seed-pool nickname onto ANY submission with a null nickname. That
// was a one-time migration aid for the original seed rows, but on a live DB it
// rewrote real anonymous community submissions with fabricated identities on
// every restart. Anonymous rows now stay anonymous.

export function seedIfEmpty(): void {
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

// ----------------------------------------------------------------------------
// purgeClosedModelsIfPresent — one-time scrub.
//
// Earlier seed versions populated the leaderboard with frontier API models
// (Claude Opus 4.7, GPT-5.5, Gemini 2.5 Pro, etc.) showing fake "ran on
// m3-max-128gb" hardware tags. Closed-weights models can't run on local
// hardware, so the rows were misleading.
//
// This function removes those models + their submissions + their task_results
// from the DB. Safe to call on every boot — does nothing if the rows are
// already gone.
//
// Preserves REAL user submissions (submitter_ip != 'seed') against these
// model slugs in case anyone ran a cloud-API benchmark before this scrub.
// ----------------------------------------------------------------------------
export function purgeClosedModelsIfPresent(): void {
  // First, find any model IDs for closed-weights slugs that have only
  // seeded submissions (no real user data). Those we delete entirely.
  // Models with real user submissions we leave intact — those users
  // intentionally tagged them as cloud-api.
  const placeholders = CLOSED_API_ONLY_SLUGS.map(() => '?').join(',');
  const closedModels = db
    .prepare(`SELECT id, slug FROM models WHERE slug IN (${placeholders})`)
    .all(...CLOSED_API_ONLY_SLUGS) as Array<{ id: string; slug: string }>;

  if (closedModels.length === 0) {
    return;
  }

  let totalPurged = 0;
  const txn = db.transaction(() => {
    for (const m of closedModels) {
      // Delete only seed-marked submissions for this model.
      const seededSubs = db
        .prepare(`SELECT id FROM submissions WHERE model_id = ? AND submitter_ip = 'seed'`)
        .all(m.id) as Array<{ id: string }>;
      if (seededSubs.length > 0) {
        const subIds = seededSubs.map((s) => s.id);
        const subPlaceholders = subIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM task_results WHERE submission_id IN (${subPlaceholders})`).run(...subIds);
        db.prepare(`DELETE FROM submissions WHERE id IN (${subPlaceholders})`).run(...subIds);
        totalPurged += seededSubs.length;
      }

      // If the model now has zero submissions of any kind, drop the model row too.
      const remaining = db
        .prepare(`SELECT COUNT(*) AS c FROM submissions WHERE model_id = ?`)
        .get(m.id) as { c: number };
      if (remaining.c === 0) {
        db.prepare(`DELETE FROM models WHERE id = ?`).run(m.id);
        console.log(`[purge] removed closed-weights model "${m.slug}" (no real submissions)`);
      } else {
        console.log(
          `[purge] kept closed-weights model "${m.slug}" — ${remaining.c} real user submissions present`
        );
      }
    }
  });
  txn();

  if (totalPurged > 0) {
    console.log(`[purge] removed ${totalPurged} seeded submissions of closed-weights models`);
  }
}

// ----------------------------------------------------------------------------
// normalizePlaceholderNicknamesIfPresent — one-time scrub.
//
// The submit route rejects docs-example nicknames ("yourusername" and friends)
// and stores them as anonymous, but that check landed after a real submission
// had already come in under one. Someone benchmarked gemma4:12b on their own
// RTX 3070 and pasted the example command verbatim, so the top of the public
// user board read "yourusername" — which looks to any visitor like the site
// shipped with unfilled placeholder text.
//
// This applies the current policy retroactively: the run stays on the board
// with its score, hardware tag and share page intact, it just becomes
// anonymous. Nothing is deleted.
//
// Idempotent by construction — once a nickname is NULL it matches nothing on
// the next boot. Safe to call on every start.
//
// Side effect worth knowing: beta-tester ranks are DERIVED from the earliest
// real submission per named nickname (lib/beta-testers.ts), so anonymizing a
// row releases its slot and everyone below it moves up one.
// ----------------------------------------------------------------------------
export function normalizePlaceholderNicknamesIfPresent(): void {
  const names = [...PLACEHOLDER_NICKNAMES];
  const placeholders = names.map(() => '?').join(',');
  const result = db
    .prepare(
      `UPDATE submissions
          SET user_nickname = NULL
        WHERE user_nickname IS NOT NULL
          AND lower(user_nickname) IN (${placeholders})`
    )
    .run(...names);

  if (result.changes > 0) {
    console.log(
      `[scrub] anonymized ${result.changes} submission(s) that were posted under a docs placeholder nickname`
    );
  }
}

// ----------------------------------------------------------------------------
// purgeSeedSubmissionsIfPresent — the honesty scrub. Runs LAST on every boot.
//
// PipelineScore's entire claim is "real runs on real rigs". On 2026-08-18 the
// live board was ~429 seeded submissions to 7 genuine ones — the hardware board
// was advertising B200 and A100 rigs nobody had ever run. Synthetic rows that
// look measured are worse than an empty board: this audience checks, and the
// credibility is the product.
//
// So: no synthetic submissions are served, ever. Seed rows are identified by
// `submitter_ip = 'seed'`, which both seedIfEmpty() and augmentIfMissing() set.
//
// The MODELS catalog is deliberately preserved — it is legitimate reference
// data (names, families, context windows), it is what makes an empty board
// browsable, and keeping it non-empty is what stops seedIfEmpty() from firing
// again on a fresh disk.
//
// ⚠️ Call this AFTER seedIfEmpty() and augmentIfMissing(), not before. Both of
// those still create sample rows; running last means the system self-heals even
// if the persistent disk is lost and the whole seed path re-runs.
// Idempotent — does nothing once the rows are gone.
// ----------------------------------------------------------------------------
export function purgeSeedSubmissionsIfPresent(): void {
  const seeded = db
    .prepare(`SELECT id FROM submissions WHERE submitter_ip = 'seed'`)
    .all() as Array<{ id: string }>;
  if (seeded.length === 0) return;

  const ids = seeded.map((s) => s.id);
  const txn = db.transaction(() => {
    // Delete in chunks — SQLite caps bound parameters (default 999).
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const ph = chunk.map(() => '?').join(',');
      db.prepare(`DELETE FROM task_results WHERE submission_id IN (${ph})`).run(...chunk);
      db.prepare(`DELETE FROM submissions WHERE id IN (${ph})`).run(...chunk);
    }
  });
  txn();

  const remaining = (db.prepare('SELECT COUNT(*) AS c FROM submissions').get() as { c: number }).c;
  console.log(
    `[purge] removed ${ids.length} synthetic submissions — ${remaining} real submission(s) remain`
  );
}
