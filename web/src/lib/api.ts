// API client for the PipelineScore backend. Falls back to mock data when backend
// is unreachable so the site stays demo-able locally without it.
import { MOCK_MODELS, MOCK_SUBMISSIONS, getModelBySlug as getMockModelBySlug, SAMPLE_TASKS, MOCK_USER_ENTRIES, MOCK_USER_DIRECTORY } from './mockData';
import type {
  CategoryScores,
  HardwareBoardRow,
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
  score_detail?: {
    speed?: { scored?: boolean; speed_score?: number };
    pipeline_ci_low?: number;
    pipeline_ci_high?: number;
  } | null;
  lab_verified: boolean;
  created_at: string;
  model: {
    slug: string;
    display_name: string;
    provider: string;
    family?: string;
  };
}

// Runs from CLI <0.4.0 kept speed only inside score_detail (throughput-based),
// so category_scores.speed is absent on those rows. Fall back so old runs
// don't render a phantom 0.0 speed.
function speedOf(
  categoryScores: Record<string, number>,
  detail?: BackendLeaderboardEntry['score_detail'],
): number {
  if (typeof categoryScores.speed === 'number') return categoryScores.speed;
  if (detail?.speed?.scored && typeof detail.speed.speed_score === 'number') {
    return Math.round(detail.speed.speed_score * 100) / 100;
  }
  return 0;
}

// /v1/models/{slug} response. Medians are nested under `stats`; the
// recent_submissions entries are bare (no nested model, `id` not
// `submission_id`).
interface BackendModelSubmission {
  id: string;
  pipeline_score: number;
  tier: TierId;
  category_scores: Record<string, number>;
  lab_verified: boolean;
  created_at: string;
}

interface BackendModelDetail {
  slug: string;
  display_name: string;
  provider: string;
  family?: string;
  context_window?: number;
  released_at?: string;
  stats?: {
    submission_count?: number;
    median_pipeline_score?: number;
    median_category_scores?: Record<string, number>;
    best_pipeline_score?: number;
  };
  recent_submissions?: BackendModelSubmission[];
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
      tool_use: e.category_scores.tool_use ?? 0,
      rag: e.category_scores.rag ?? 0,
      speed: speedOf(e.category_scores, e.score_detail),
    },
  };
}

/** Top-of-leaderboard view. Returns a deduped per-model leaderboard ordered by score. */
export async function getLeaderboardModels(): Promise<Model[]> {
  // Pull a large window so every model shows up at least once, then dedupe by
  // slug. days=365 explicitly: the backend's old 30-day default silently
  // emptied this board once early submissions aged out.
  const res = await timedFetch(`${API_BASE}/v1/leaderboard?limit=200&days=365`);
  if (!res) return MOCK_MODELS;
  try {
    const data = await res.json() as { entries: BackendLeaderboardEntry[] };
    // Keep highest score per slug; count how many entries back each row.
    const best: Record<string, Model> = {};
    const samples: Record<string, number> = {};
    for (const e of data.entries) {
      const m = adaptEntryToModel(e);
      samples[m.slug] = (samples[m.slug] ?? 0) + 1;
      const cur = best[m.slug];
      if (!cur || m.pipelineScore > cur.pipelineScore) best[m.slug] = m;
    }
    const list = Object.values(best)
      .map((m) => ({ ...m, samples: samples[m.slug] ?? 1 }))
      .sort((a, b) => b.pipelineScore - a.pipelineScore);
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
    const median = data.stats?.median_pipeline_score ?? 0;
    const scores = data.stats?.median_category_scores ?? {};
    return {
      slug: data.slug,
      displayName: data.display_name,
      provider: data.provider,
      family: data.family ?? data.provider,
      contextWindow: data.context_window ?? 0,
      releasedAt: data.released_at ?? '',
      labVerified: false,
      pipelineScore: median,
      tier: tierForScore(median),
      categoryScores: {
        code: scores.code ?? 0,
        reason: scores.reason ?? 0,
        tool_use: scores.tool_use ?? 0,
        rag: scores.rag ?? 0,
        speed: scores.speed ?? 0,
      },
      samples: data.stats?.submission_count,
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
    return (data.recent_submissions ?? []).map((e) => ({
      id: e.id,
      modelSlug: slug,
      pipelineScore: e.pipeline_score,
      tier: e.tier,
      categoryScores: {
        code: e.category_scores.code ?? 0,
        reason: e.category_scores.reason ?? 0,
        tool_use: e.category_scores.tool_use ?? 0,
        rag: e.category_scores.rag ?? 0,
        speed: e.category_scores.speed ?? 0,
      },
      labVerified: !!e.lab_verified,
      submittedAt: e.created_at,
      cliVersion: 'unknown',
    }));
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
  hardware_tag?: string | null;
  beta_tester_rank?: number | null;
  created_at: string;
  cli_version: string;
  efficiency?: {
    total_tokens?: number;
    avg_latency_ms?: number | null;
    task_count?: number;
  };
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
      tool_use: e.category_scores.tool_use ?? 0,
      rag: e.category_scores.rag ?? 0,
      speed: e.category_scores.speed ?? 0,
    },
    labVerified: !!e.lab_verified,
    configTag: e.config_tag ?? null,
    hardwareTag: e.hardware_tag ?? null,
    betaTesterRank: e.beta_tester_rank ?? null,
    submittedAt: e.created_at,
    cliVersion: e.cli_version,
    efficiency: {
      totalTokens: e.efficiency?.total_tokens ?? 0,
      avgLatencyMs: e.efficiency?.avg_latency_ms ?? null,
      taskCount: e.efficiency?.task_count ?? 0,
    },
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
  search?: string;
  hardware?: string;
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
  if (q.search) params.set('search', q.search);
  if (q.hardware) params.set('hardware', q.hardware);
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
      hardware_counts?: Record<string, number>;
      beta_tester_rank?: number | null;
      efficiency?: {
        total_tokens?: number;
        total_tasks_run?: number;
        avg_latency_ms?: number | null;
      };
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
      hardwareCounts: data.hardware_counts ?? {},
      betaTesterRank: data.beta_tester_rank ?? null,
      efficiency: {
        totalTokens: data.efficiency?.total_tokens ?? 0,
        totalTasksRun: data.efficiency?.total_tasks_run ?? 0,
        avgLatencyMs: data.efficiency?.avg_latency_ms ?? null,
      },
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

/**
 * Hardware board: every submission with a hardware tag, collapsed to one row
 * per rig. Built from the user leaderboard (the backend has no dedicated
 * endpoint); entries arrive score-desc so the first hit per tag is its best.
 */
export async function getHardwareBoard(prefetched?: UserLeaderboardPage): Promise<HardwareBoardRow[]> {
  const page = prefetched ?? (await getUserLeaderboard({ sort: 'score', dir: 'desc', limit: 500 }));
  const rows = new Map<
    string,
    HardwareBoardRow & { _users: Set<string>; _latencies: number[] }
  >();
  for (const e of page.entries) {
    const tag = e.hardwareTag;
    if (!tag) continue;
    let row = rows.get(tag);
    if (!row) {
      row = {
        tag,
        bestScore: e.pipelineScore,
        bestTier: e.tier,
        bestModel: {
          slug: e.model.slug,
          displayName: e.model.displayName,
          provider: e.model.provider,
        },
        bestCategoryScores: { ...e.categoryScores } as CategoryScores,
        runs: 0,
        users: 0,
        avgLatencyMs: null,
        _users: new Set<string>(),
        _latencies: [],
      };
      rows.set(tag, row);
    }
    row.runs += 1;
    row._users.add(e.userNickname);
    if (e.efficiency.avgLatencyMs !== null) row._latencies.push(e.efficiency.avgLatencyMs);
    if (e.pipelineScore > row.bestScore) {
      row.bestScore = e.pipelineScore;
      row.bestTier = e.tier;
      row.bestModel = {
        slug: e.model.slug,
        displayName: e.model.displayName,
        provider: e.model.provider,
      };
      row.bestCategoryScores = { ...e.categoryScores } as CategoryScores;
    }
  }
  return Array.from(rows.values())
    .map(({ _users, _latencies, ...row }) => ({
      ...row,
      users: _users.size,
      avgLatencyMs:
        _latencies.length > 0
          ? Math.round(_latencies.reduce((a, b) => a + b, 0) / _latencies.length)
          : null,
    }))
    .sort((a, b) => b.bestScore - a.bestScore);
}

function mockUserPage(q: UserLeaderboardQuery): UserLeaderboardPage {
  let entries = [...MOCK_USER_ENTRIES];
  if (q.provider) entries = entries.filter((e) => e.model.provider === q.provider);
  if (q.tier) entries = entries.filter((e) => e.tier === q.tier);
  if (q.user) entries = entries.filter((e) => e.userNickname === q.user);
  if (q.hardware) entries = entries.filter((e) => e.hardwareTag === q.hardware);
  if (q.search) {
    const needle = q.search.toLowerCase();
    entries = entries.filter((e) => e.userNickname.toLowerCase().includes(needle));
  }
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
    filters: { provider: q.provider, tier: q.tier, user: q.user, search: q.search, hardware: q.hardware, lab_verified: !!q.labVerified, days: 365, sort, dir },
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
  const hardwareCounts: Record<string, number> = {};
  let totalTokens = 0;
  let totalTasksRun = 0;
  const latencySamples: number[] = [];
  for (const e of subs) {
    providerCounts[e.model.provider] = (providerCounts[e.model.provider] ?? 0) + 1;
    const h = e.hardwareTag ?? 'unspecified';
    hardwareCounts[h] = (hardwareCounts[h] ?? 0) + 1;
    totalTokens += e.efficiency.totalTokens ?? 0;
    totalTasksRun += e.efficiency.taskCount ?? 0;
    if (e.efficiency.avgLatencyMs !== null) latencySamples.push(e.efficiency.avgLatencyMs);
  }
  const avgLatencyMs =
    latencySamples.length > 0
      ? Math.round(latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length)
      : null;
  return {
    nickname,
    submissionCount: subs.length,
    bestScore: best.pipelineScore,
    bestTier: best.tier,
    bestModel: best.model,
    avgScore: Math.round((subs.reduce((s, e) => s + e.pipelineScore, 0) / subs.length) * 100) / 100,
    modelsTried: Object.values(bestPerModel).sort((a, b) => b.pipelineScore - a.pipelineScore),
    providerCounts,
    hardwareCounts,
    betaTesterRank: null,
    efficiency: { totalTokens, totalTasksRun, avgLatencyMs },
    firstSeen: subs.reduce((min, e) => (e.submittedAt < min ? e.submittedAt : min), subs[0].submittedAt),
    submissions: sorted,
  };
}

export interface SiteStats {
  submission_count: number;
  user_count: number;
  model_count: number;
}

export async function getStats(): Promise<SiteStats> {
  const res = await timedFetch(`${API_BASE}/v1/stats`);
  if (!res) return { submission_count: 0, user_count: 0, model_count: 0 };
  try {
    const d = (await res.json()) as Partial<SiteStats>;
    return {
      submission_count: d.submission_count ?? 0,
      user_count: d.user_count ?? 0,
      model_count: d.model_count ?? 0,
    };
  } catch {
    return { submission_count: 0, user_count: 0, model_count: 0 };
  }
}

export interface SubmissionDetail {
  id: string;
  model: { slug: string; displayName: string; provider: string };
  pipelineScore: number;
  tier: TierId;
  categoryScores: CategoryScores;
  userNickname: string | null;
  hardwareTag: string | null;
  configTag: string | null;
  cliVersion: string;
  labVerified: boolean;
  testpackVersion: string;
  createdAt: string;
  ciLow: number | null;
  ciHigh: number | null;
}

/** Single run, for the /s/[id] share page. undefined = not found, null = backend unreachable. */
export async function getSubmission(id: string): Promise<SubmissionDetail | null | undefined> {
  const res = await timedFetch(`${API_BASE}/v1/submissions/${encodeURIComponent(id)}`);
  if (!res) return null;
  try {
    const d = (await res.json()) as {
      id?: string;
      model?: { slug?: string; display_name?: string; provider?: string };
      pipeline_score?: number;
      tier?: TierId;
      category_scores?: Record<string, number>;
      score_detail?: BackendLeaderboardEntry['score_detail'];
      user_nickname?: string | null;
      hardware_tag?: string | null;
      config_tag?: string | null;
      cli_version?: string;
      lab_verified?: boolean;
      testpack_version?: string;
      created_at?: string;
    };
    if (!d?.id || !d.model?.slug) return undefined;
    const cs = d.category_scores ?? {};
    return {
      id: d.id,
      model: {
        slug: d.model.slug,
        displayName: d.model.display_name ?? d.model.slug,
        provider: d.model.provider ?? 'local',
      },
      pipelineScore: d.pipeline_score ?? 0,
      tier: d.tier ?? tierForScore(d.pipeline_score ?? 0),
      categoryScores: {
        code: cs.code ?? 0,
        reason: cs.reason ?? 0,
        tool_use: cs.tool_use ?? 0,
        rag: cs.rag ?? 0,
        speed: speedOf(cs, d.score_detail),
      },
      userNickname: d.user_nickname ?? null,
      hardwareTag: d.hardware_tag ?? null,
      configTag: d.config_tag ?? null,
      cliVersion: d.cli_version ?? 'unknown',
      labVerified: !!d.lab_verified,
      testpackVersion: d.testpack_version ?? '',
      createdAt: d.created_at ?? '',
      ciLow: typeof d.score_detail?.pipeline_ci_low === 'number' ? d.score_detail.pipeline_ci_low : null,
      ciHigh: typeof d.score_detail?.pipeline_ci_high === 'number' ? d.score_detail.pipeline_ci_high : null,
    };
  } catch {
    return undefined;
  }
}

// Re-export the sample tasks so pages don't have to know where to find them.
export { SAMPLE_TASKS };
