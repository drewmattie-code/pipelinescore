import type { Model, Submission } from "./types";
import { tierForScore } from "./tiers";

// 10 LLMs across the score range. Scores chosen to distribute across tiers.
const RAW_MODELS: Omit<Model, "tier">[] = [
  {
    slug: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    provider: "Anthropic",
    family: "claude",
    contextWindow: 1000000,
    releasedAt: "2026-02-14",
    pipelineScore: 91.4,
    categoryScores: { code: 93.2, reason: 94.8, write: 92.1, tool_use: 91.5, rag: 90.6, speed: 84.1 },
    labVerified: true,
    notes: "Anchored reference model. Strongest on long-context reasoning + tool use.",
  },
  {
    slug: "gpt-5-5",
    displayName: "GPT-5.5",
    provider: "OpenAI",
    family: "gpt",
    contextWindow: 400000,
    releasedAt: "2026-03-02",
    pipelineScore: 88.7,
    categoryScores: { code: 91.0, reason: 90.4, write: 87.8, tool_use: 88.6, rag: 86.2, speed: 87.5 },
    labVerified: true,
  },
  {
    slug: "gemini-2-5-pro",
    displayName: "Gemini 2.5 Pro",
    provider: "Google",
    family: "gemini",
    contextWindow: 2000000,
    releasedAt: "2026-01-28",
    pipelineScore: 85.9,
    categoryScores: { code: 84.4, reason: 87.7, write: 85.2, tool_use: 84.1, rag: 91.8, speed: 82.9 },
    labVerified: true,
  },
  {
    slug: "deepseek-v4",
    displayName: "DeepSeek V4",
    provider: "DeepSeek",
    family: "deepseek",
    contextWindow: 256000,
    releasedAt: "2026-04-09",
    pipelineScore: 82.3,
    categoryScores: { code: 88.6, reason: 85.1, write: 76.2, tool_use: 81.4, rag: 78.7, speed: 83.5 },
    labVerified: true,
  },
  {
    slug: "qwen3-6-72b",
    displayName: "Qwen 3.6 72B",
    provider: "Alibaba",
    family: "qwen",
    contextWindow: 128000,
    releasedAt: "2026-04-22",
    pipelineScore: 78.4,
    categoryScores: { code: 79.8, reason: 81.2, write: 74.3, tool_use: 78.1, rag: 75.4, speed: 81.0 },
    labVerified: false,
  },
  {
    slug: "llama-4-405b",
    displayName: "Llama 4 405B",
    provider: "Meta",
    family: "llama",
    contextWindow: 256000,
    releasedAt: "2026-03-18",
    pipelineScore: 76.1,
    categoryScores: { code: 77.6, reason: 78.4, write: 73.8, tool_use: 74.2, rag: 76.9, speed: 75.4 },
    labVerified: true,
  },
  {
    slug: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    provider: "Anthropic",
    family: "claude",
    contextWindow: 200000,
    releasedAt: "2026-02-14",
    pipelineScore: 73.5,
    categoryScores: { code: 70.2, reason: 74.8, write: 75.6, tool_use: 73.0, rag: 72.1, speed: 92.4 },
    labVerified: true,
    notes: "Used as the PipelineScore judge model.",
  },
  {
    slug: "mistral-large-2",
    displayName: "Mistral Large 2",
    provider: "Mistral",
    family: "mistral",
    contextWindow: 128000,
    releasedAt: "2026-01-09",
    pipelineScore: 68.9,
    categoryScores: { code: 71.4, reason: 70.1, write: 67.8, tool_use: 66.5, rag: 68.7, speed: 70.2 },
    labVerified: false,
  },
  {
    slug: "kimi-k2-7",
    displayName: "Kimi K2.7",
    provider: "Moonshot",
    family: "kimi",
    contextWindow: 200000,
    releasedAt: "2026-05-01",
    pipelineScore: 64.2,
    categoryScores: { code: 60.1, reason: 67.3, write: 65.9, tool_use: 62.7, rag: 65.4, speed: 64.8 },
    labVerified: false,
  },
  {
    slug: "command-r-plus",
    displayName: "Command R+",
    provider: "Cohere",
    family: "command",
    contextWindow: 128000,
    releasedAt: "2025-11-12",
    pipelineScore: 56.8,
    categoryScores: { code: 51.2, reason: 58.6, write: 62.1, tool_use: 55.9, rag: 60.8, speed: 54.7 },
    labVerified: false,
  },
];

export const MOCK_MODELS: Model[] = RAW_MODELS.map((m) => ({
  ...m,
  tier: tierForScore(m.pipelineScore),
})).sort((a, b) => b.pipelineScore - a.pipelineScore);

// ~30 submissions across the models — varied dates and small score drift.
const SUBMISSION_DATES = [
  "2026-05-21T09:14:00Z",
  "2026-05-20T16:42:00Z",
  "2026-05-20T11:08:00Z",
  "2026-05-19T22:33:00Z",
  "2026-05-19T14:21:00Z",
  "2026-05-18T08:55:00Z",
  "2026-05-17T19:47:00Z",
  "2026-05-17T13:12:00Z",
  "2026-05-16T20:04:00Z",
  "2026-05-16T07:32:00Z",
  "2026-05-15T18:19:00Z",
  "2026-05-14T11:51:00Z",
  "2026-05-13T21:08:00Z",
  "2026-05-12T15:26:00Z",
  "2026-05-11T09:43:00Z",
];

function makeSubmissions(): Submission[] {
  const subs: Submission[] = [];
  let n = 0;
  for (const m of MOCK_MODELS) {
    const count = m.labVerified ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const driftPct = (Math.sin(n * 1.7) * 1.8) / 100;
      const score = Math.max(0, Math.min(100, m.pipelineScore * (1 + driftPct)));
      const drift = (k: number) => Math.max(0, Math.min(100, k * (1 + driftPct)));
      subs.push({
        id: `sub-${m.slug}-${i + 1}`,
        modelSlug: m.slug,
        pipelineScore: Number(score.toFixed(2)),
        tier: tierForScore(score),
        categoryScores: {
          code: Number(drift(m.categoryScores.code).toFixed(2)),
          reason: Number(drift(m.categoryScores.reason).toFixed(2)),
          write: Number(drift(m.categoryScores.write).toFixed(2)),
          tool_use: Number(drift(m.categoryScores.tool_use).toFixed(2)),
          rag: Number(drift(m.categoryScores.rag).toFixed(2)),
          speed: Number(drift(m.categoryScores.speed).toFixed(2)),
        },
        submittedAt: SUBMISSION_DATES[n % SUBMISSION_DATES.length],
        cliVersion: "0.1.0",
        labVerified: m.labVerified && i === 0,
      });
      n++;
    }
  }
  return subs;
}

export const MOCK_SUBMISSIONS: Submission[] = makeSubmissions();

export function getModelBySlug(slug: string): Model | undefined {
  return MOCK_MODELS.find((m) => m.slug === slug);
}

// Sample tasks for the model detail page (subset of the v1 task catalog).
export const SAMPLE_TASKS = [
  {
    id: "code-fib-1",
    category: "code" as const,
    difficulty: 1,
    title: "Fibonacci function",
    prompt: "Write a Python `fib(n)` returning the nth Fibonacci number, O(n).",
  },
  {
    id: "reason-math-1",
    category: "reason" as const,
    difficulty: 1,
    title: "Train meeting time",
    prompt: "Two trains, opposite directions, given speeds and start times — when do they meet?",
  },
  {
    id: "write-tagline-1",
    category: "write" as const,
    difficulty: 1,
    title: "Five distinct taglines",
    prompt: "Write 5 one-line taglines for a benchmark tool. <=10 words each, no numbering.",
  },
  {
    id: "tool-schema-1",
    category: "tool_use" as const,
    difficulty: 2,
    title: "OpenAPI param selection",
    prompt: "Given an OpenAPI schema with limit/offset/sort, fill JSON for 'next 50, recent first.'",
  },
  {
    id: "rag-grounding-1",
    category: "rag" as const,
    difficulty: 2,
    title: "Refuses to fabricate",
    prompt: "Context lacks the answer — does the model fabricate or correctly say it can't?",
  },
];

// ---- User mock data (fallback when backend is unreachable) -------------------
import type { UserLeaderboardEntry, UserDirectoryEntry } from './types';

const MOCK_NICKS = [
  'karpathy_lite', 'goose-engineer', 'rust_witch', 'forklift', 'mira-shen',
  'devnull', 'pipelinepilot', 'dr_inference', 'tokenwrangler', 'shipfastly',
  'silicon-djinn', 'cli-native', 'haiku_or_die', 'opus-believer', 'gpt-cynic',
  'gemini-fan', 'localmodels', 'edge_runner', 'agentic_dad', 'context-window',
  'judgemental', 'rag-doll', 'tool-caller', 'reason-first', 'temp-zero',
  'frontiermodel', 'open-weights', 'mistral-maxi', 'qwen-stan', 'deepseek-wins',
  'cohere-cult', 'llama-llama', 'kimi-curious', 'benchmark-rat', 'lab',
];

function pickNick(seed: number): string {
  return MOCK_NICKS[seed % MOCK_NICKS.length];
}

export const MOCK_USER_ENTRIES: UserLeaderboardEntry[] = (() => {
  const out: UserLeaderboardEntry[] = [];
  let n = 0;
  for (const m of MOCK_MODELS) {
    const submissionCount = 12;
    for (let i = 0; i < submissionCount; i++) {
      const driftPct = (Math.sin(n * 1.31) * 2.5) / 100;
      const score = Math.max(0, Math.min(100, m.pipelineScore * (1 + driftPct)));
      const drift = (k: number) => Math.max(0, Math.min(100, k * (1 + driftPct)));
      const isLab = i === 0;
      const daysAgo = (n * 7919) % 28;
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
      const MOCK_TAGS: (string | null)[] = [
        null, null, null,
        'system-prompt-coder',
        'tools-enabled',
        'lora-domain-finance',
        'temp-zero',
        'cot-style',
      ];
      const MOCK_HARDWARE: (string | null)[] = [
        null,
        'm3-max-128gb',
        'm2-ultra-192gb',
        'rtx-4090-24gb',
        'rtx-3090-24gb',
        'a100-80gb',
        'cloud-api',
        'cloud-api',
      ];
      out.push({
        submissionId: `mock-${m.slug}-${i + 1}`,
        userNickname: isLab ? 'lab' : pickNick(n * 13 + 7),
        pipelineScore: Number(score.toFixed(2)),
        tier: tierForScore(score),
        categoryScores: {
          code: Number(drift(m.categoryScores.code).toFixed(2)),
          reason: Number(drift(m.categoryScores.reason).toFixed(2)),
          write: Number(drift(m.categoryScores.write).toFixed(2)),
          tool_use: Number(drift(m.categoryScores.tool_use).toFixed(2)),
          rag: Number(drift(m.categoryScores.rag).toFixed(2)),
          speed: Number(drift(m.categoryScores.speed).toFixed(2)),
        },
        labVerified: isLab,
        configTag: isLab ? null : MOCK_TAGS[(n * 7) % MOCK_TAGS.length],
        hardwareTag: isLab ? 'lab-baseline' : MOCK_HARDWARE[(n * 11) % MOCK_HARDWARE.length],
        submittedAt: date,
        cliVersion: '0.1.0',
        efficiency: {
          totalTokens: 4000 + Math.floor((n * 137) % 4000),
          avgLatencyMs: 400 + Math.floor((n * 73) % 800),
          taskCount: 25,
        },
        model: {
          slug: m.slug,
          displayName: m.displayName,
          provider: m.provider,
          family: m.family,
        },
      });
      n++;
    }
  }
  return out;
})();

export const MOCK_USER_DIRECTORY: UserDirectoryEntry[] = (() => {
  const agg: Record<string, { count: number; best: number }> = {};
  for (const e of MOCK_USER_ENTRIES) {
    const cur = agg[e.userNickname];
    if (!cur) agg[e.userNickname] = { count: 1, best: e.pipelineScore };
    else {
      cur.count++;
      if (e.pipelineScore > cur.best) cur.best = e.pipelineScore;
    }
  }
  return Object.entries(agg)
    .map(([userNickname, v]) => ({ userNickname, submissionCount: v.count, bestScore: v.best }))
    .sort((a, b) => b.bestScore - a.bestScore);
})();
