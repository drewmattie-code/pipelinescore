// API client for the PipelineScore backend. Falls back to mock data when backend
// is unreachable so the site stays demo-able locally without it.
import { MOCK_MODELS, MOCK_SUBMISSIONS, getModelBySlug as getMockModelBySlug, SAMPLE_TASKS } from './mockData';
import type { Model, Submission, TierId } from './types';

const API_BASE = process.env.PIPELINESCORE_API_BASE ?? 'http://localhost:4601';
const FETCH_TIMEOUT_MS = 1500;

async function timedFetch(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

interface BackendLeaderboardEntry {
  submission_id: string;
  pipeline_score: number;
  tier: TierId;
  category_scores: Record<string, number>;
  lab_verified: boolean;
  created_at: string;
  model: {
    slug: string;
    display_name: string;
    provider: string;
    family?: string;
  };
}

interface BackendModelDetail {
  slug: string;
  display_name: string;
  provider: string;
  family?: string;
  context_window?: number;
  median_pipeline_score?: number;
  median_category_scores?: Record<string, number>;
  recent_submissions?: BackendLeaderboardEntry[];
}

// Adapt a backend entry into the existing Submission shape used by the UI.
function adaptEntryToSubmission(e: BackendLeaderboardEntry): Submission {
  return {
    id: e.submission_id,
    modelSlug: e.model.slug,
    pipelineScore: e.pipeline_score,
    tier: e.tier,
    categoryScores: {
      code: e.category_scores.code ?? 0,
      reason: e.category_scores.reason ?? 0,
      write: e.category_scores.write ?? 0,
      tool_use: e.category_scores.tool_use ?? 0,
      rag: e.category_scores.rag ?? 0,
      speed: e.category_scores.speed ?? 0,
    },
    labVerified: !!e.lab_verified,
    submittedAt: e.created_at,
    cliVersion: 'unknown',
  };
}

// Build a Model record from a backend entry (used when we only have submission-with-model).
function adaptEntryToModel(e: BackendLeaderboardEntry): Model {
  return {
    slug: e.model.slug,
    displayName: e.model.display_name,
    provider: e.model.provider,
    family: e.model.family ?? e.model.provider,
    contextWindow: 0,
    releasedAt: '',
    labVerified: !!e.lab_verified,
    pipelineScore: e.pipeline_score, // best-known score from this row
    tier: e.tier,
    categoryScores: {
      code: e.category_scores.code ?? 0,
      reason: e.category_scores.reason ?? 0,
      write: e.category_scores.write ?? 0,
      tool_use: e.category_scores.tool_use ?? 0,
      rag: e.category_scores.rag ?? 0,
      speed: e.category_scores.speed ?? 0,
    },
  };
}

/** Top-of-leaderboard view. Returns a deduped per-model leaderboard ordered by score. */
export async function getLeaderboardModels(): Promise<Model[]> {
  const res = await timedFetch(`${API_BASE}/v1/leaderboard?limit=100`);
  if (!res) return MOCK_MODELS;
  try {
    const data = await res.json() as { entries: BackendLeaderboardEntry[] };
    // Keep highest score per slug.
    const best: Record<string, Model> = {};
    for (const e of data.entries) {
      const m = adaptEntryToModel(e);
      const cur = best[m.slug];
      if (!cur || m.pipelineScore > cur.pipelineScore) best[m.slug] = m;
    }
    const list = Object.values(best).sort((a, b) => b.pipelineScore - a.pipelineScore);
    return list.length > 0 ? list : MOCK_MODELS;
  } catch {
    return MOCK_MODELS;
  }
}

/** Per-model detail page. */
export async function getModel(slug: string): Promise<Model | undefined> {
  const res = await timedFetch(`${API_BASE}/v1/models/${encodeURIComponent(slug)}`);
  if (!res) return getMockModelBySlug(slug);
  try {
    const data = await res.json() as BackendModelDetail;
    if (!data?.slug) return getMockModelBySlug(slug);
    const scores = data.median_category_scores ?? {};
    return {
      slug: data.slug,
      displayName: data.display_name,
      provider: data.provider,
      family: data.family ?? data.provider,
      contextWindow: data.context_window ?? 0,
      releasedAt: '',
      labVerified: false,
      pipelineScore: data.median_pipeline_score ?? 0,
      tier: tierForScore(data.median_pipeline_score ?? 0),
      categoryScores: {
        code: scores.code ?? 0,
        reason: scores.reason ?? 0,
        write: scores.write ?? 0,
        tool_use: scores.tool_use ?? 0,
        rag: scores.rag ?? 0,
        speed: scores.speed ?? 0,
      },
    };
  } catch {
    return getMockModelBySlug(slug);
  }
}

export async function getRecentSubmissions(slug: string): Promise<Submission[]> {
  const res = await timedFetch(`${API_BASE}/v1/models/${encodeURIComponent(slug)}`);
  if (!res) {
    return MOCK_SUBMISSIONS.filter((s) => s.modelSlug === slug);
  }
  try {
    const data = await res.json() as BackendModelDetail;
    return (data.recent_submissions ?? []).map(adaptEntryToSubmission);
  } catch {
    return MOCK_SUBMISSIONS.filter((s) => s.modelSlug === slug);
  }
}

function tierForScore(s: number): TierId {
  if (s >= 90) return 'trunk';
  if (s >= 75) return 'mainline';
  if (s >= 60) return 'feeder';
  if (s >= 40) return 'tap';
  return 'drip';
}

// Re-export the sample tasks so pages don't have to know where to find them.
export { SAMPLE_TASKS };
