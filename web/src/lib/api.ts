// API client for the PipelineScore backend. Falls back to mock data when backend
// is unreachable so the site stays demo-able locally without it.
import { MOCK_MODELS, MOCK_SUBMISSIONS, getModelBySlug as getMockModelBySlug, SAMPLE_TASKS, MOCK_USER_ENTRIES, MOCK_USER_DIRECTORY } from './mockData';
import type {
  Model,
  Submission,
  TierId,
  UserLeaderboardEntry,
  UserLeaderboardPage,
  UserProfile,
  UserDirectoryEntry,
} from './types';

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

interface BackendUserEntry {
  submission_id: string;
  user_nickname: string;
  pipeline_score: number;
  tier: TierId;
  category_scores: Record<string, number>;
  lab_verified: boolean;
  config_tag?: string | null;
  created_at: string;
  cli_version: string;
  model: {
    slug: string;
    display_name: string;
    provider: string;
    family?: string | null;
  };
}

function adaptUserEntry(e: BackendUserEntry): UserLeaderboardEntry {
  return {
    submissionId: e.submission_id,
    userNickname: e.user_nickname,
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
    configTag: e.config_tag ?? null,
    submittedAt: e.created_at,
    cliVersion: e.cli_version,
    model: {
      slug: e.model.slug,
      displayName: e.model.display_name,
      provider: e.model.provider,
      family: e.model.family ?? null,
    },
  };
}

export interface UserLeaderboardQuery {
  provider?: string;
  tier?: string;
  user?: string;
  labVerified?: boolean;
  sort?: 'score' | 'date' | 'user' | 'model' | 'provider' | 'tier';
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** Long-form user leaderboard (paginated, sortable, filterable). */
export async function getUserLeaderboard(q: UserLeaderboardQuery = {}): Promise<UserLeaderboardPage> {
  const params = new URLSearchParams();
  if (q.provider) params.set('provider', q.provider);
  if (q.tier) params.set('tier', q.tier);
  if (q.user) params.set('user', q.user);
  if (q.labVerified) params.set('lab_verified', '1');
  if (q.sort) params.set('sort', q.sort);
  if (q.dir) params.set('dir', q.dir);
  params.set('limit', String(q.limit ?? 100));
  params.set('offset', String(q.offset ?? 0));

  const res = await timedFetch(`${API_BASE}/v1/leaderboard/users?${params.toString()}`);
  if (!res) return mockUserPage(q);
  try {
    const data = (await res.json()) as {
      total: number;
      count: number;
      limit: number;
      offset: number;
      filters: UserLeaderboardPage['filters'];
      entries: BackendUserEntry[];
    };
    return {
      total: data.total,
      count: data.count,
      limit: data.limit,
      offset: data.offset,
      filters: data.filters,
      entries: data.entries.map(adaptUserEntry),
    };
  } catch {
    return mockUserPage(q);
  }
}

export async function getUserProfile(nickname: string): Promise<UserProfile | undefined> {
  const res = await timedFetch(`${API_BASE}/v1/users/${encodeURIComponent(nickname)}`);
  if (!res) return mockUserProfile(nickname);
  if (res.status === 404) return undefined;
  try {
    const data = (await res.json()) as {
      nickname: string;
      submission_count: number;
      best_score: number;
      best_tier: TierId;
      best_model: BackendUserEntry['model'];
      avg_score: number;
      models_tried: BackendUserEntry[];
      provider_counts: Record<string, number>;
      first_seen: string;
      submissions: BackendUserEntry[];
    };
    return {
      nickname: data.nickname,
      submissionCount: data.submission_count,
      bestScore: data.best_score,
      bestTier: data.best_tier,
      bestModel: {
        slug: data.best_model.slug,
        displayName: data.best_model.display_name,
        provider: data.best_model.provider,
        family: data.best_model.family ?? null,
      },
      avgScore: data.avg_score,
      modelsTried: data.models_tried.map(adaptUserEntry),
      providerCounts: data.provider_counts,
      firstSeen: data.first_seen,
      submissions: data.submissions.map(adaptUserEntry),
    };
  } catch {
    return mockUserProfile(nickname);
  }
}

export async function getUserDirectory(): Promise<UserDirectoryEntry[]> {
  const res = await timedFetch(`${API_BASE}/v1/users`);
  if (!res) return MOCK_USER_DIRECTORY;
  try {
    const data = (await res.json()) as { users: Array<{ user_nickname: string; submission_count: number; best_score: number }> };
    return data.users.map((u) => ({
      userNickname: u.user_nickname,
      submissionCount: u.submission_count,
      bestScore: u.best_score,
    }));
  } catch {
    return MOCK_USER_DIRECTORY;
  }
}

function mockUserPage(q: UserLeaderboardQuery): UserLeaderboardPage {
  let entries = [...MOCK_USER_ENTRIES];
  if (q.provider) entries = entries.filter((e) => e.model.provider === q.provider);
  if (q.tier) entries = entries.filter((e) => e.tier === q.tier);
  if (q.user) entries = entries.filter((e) => e.userNickname === q.user);
  if (q.labVerified) entries = entries.filter((e) => e.labVerified);
  const sort = q.sort ?? 'score';
  const dir = q.dir ?? 'desc';
  const mul = dir === 'asc' ? 1 : -1;
  entries.sort((a, b) => {
    switch (sort) {
      case 'date':
        return mul * a.submittedAt.localeCompare(b.submittedAt);
      case 'user':
        return mul * a.userNickname.localeCompare(b.userNickname);
      case 'model':
        return mul * a.model.displayName.localeCompare(b.model.displayName);
      case 'provider':
        return mul * a.model.provider.localeCompare(b.model.provider);
      default:
        return mul * (a.pipelineScore - b.pipelineScore);
    }
  });
  const total = entries.length;
  const limit = q.limit ?? 100;
  const offset = q.offset ?? 0;
  const pageEntries = entries.slice(offset, offset + limit);
  return {
    total,
    count: pageEntries.length,
    limit,
    offset,
    filters: { provider: q.provider, tier: q.tier, user: q.user, lab_verified: !!q.labVerified, days: 365, sort, dir },
    entries: pageEntries,
  };
}

function mockUserProfile(nickname: string): UserProfile | undefined {
  const subs = MOCK_USER_ENTRIES.filter((e) => e.userNickname === nickname);
  if (subs.length === 0) return undefined;
  const sorted = [...subs].sort((a, b) => b.pipelineScore - a.pipelineScore);
  const best = sorted[0];
  const bestPerModel: Record<string, UserLeaderboardEntry> = {};
  for (const e of sorted) {
    const cur = bestPerModel[e.model.slug];
    if (!cur || e.pipelineScore > cur.pipelineScore) bestPerModel[e.model.slug] = e;
  }
  const providerCounts: Record<string, number> = {};
  for (const e of subs) providerCounts[e.model.provider] = (providerCounts[e.model.provider] ?? 0) + 1;
  return {
    nickname,
    submissionCount: subs.length,
    bestScore: best.pipelineScore,
    bestTier: best.tier,
    bestModel: best.model,
    avgScore: Math.round((subs.reduce((s, e) => s + e.pipelineScore, 0) / subs.length) * 100) / 100,
    modelsTried: Object.values(bestPerModel).sort((a, b) => b.pipelineScore - a.pipelineScore),
    providerCounts,
    firstSeen: subs.reduce((min, e) => (e.submittedAt < min ? e.submittedAt : min), subs[0].submittedAt),
    submissions: sorted,
  };
}

// Re-export the sample tasks so pages don't have to know where to find them.
export { SAMPLE_TASKS };
