// Core PipelineScore types

export type TierId = "trunk" | "mainline" | "feeder" | "tap" | "drip";

export type Category = "code" | "reason" | "write" | "tool_use" | "rag" | "speed";

export interface CategoryScores {
  code: number;
  reason: number;
  write: number;
  tool_use: number;
  rag: number;
  speed: number;
}

export interface Tier {
  id: TierId;
  name: string;
  min: number;
  max: number;
  color: string;
}

export interface Model {
  slug: string;
  displayName: string;
  provider: string;
  family: string;
  contextWindow: number;
  releasedAt: string;
  pipelineScore: number;
  tier: TierId;
  categoryScores: CategoryScores;
  labVerified: boolean;
  notes?: string;
}

export interface Submission {
  id: string;
  modelSlug: string;
  pipelineScore: number;
  tier: TierId;
  categoryScores: CategoryScores;
  submittedAt: string;
  cliVersion: string;
  labVerified: boolean;
  userNickname?: string | null;
}

// Long-form user leaderboard entry — joined w/ model display data.
export interface UserLeaderboardEntry {
  submissionId: string;
  userNickname: string;
  pipelineScore: number;
  tier: TierId;
  categoryScores: CategoryScores;
  labVerified: boolean;
  configTag: string | null;
  submittedAt: string;
  cliVersion: string;
  model: {
    slug: string;
    displayName: string;
    provider: string;
    family: string | null;
  };
}

export interface UserLeaderboardPage {
  total: number;
  count: number;
  limit: number;
  offset: number;
  filters: {
    provider?: string;
    tier?: string;
    user?: string;
    lab_verified: boolean;
    days: number;
    sort: string;
    dir: string;
  };
  entries: UserLeaderboardEntry[];
}

export interface UserProfile {
  nickname: string;
  submissionCount: number;
  bestScore: number;
  bestTier: TierId;
  bestModel: {
    slug: string;
    displayName: string;
    provider: string;
    family: string | null;
  };
  avgScore: number;
  modelsTried: UserLeaderboardEntry[];
  providerCounts: Record<string, number>;
  firstSeen: string;
  submissions: UserLeaderboardEntry[];
}

export interface UserDirectoryEntry {
  userNickname: string;
  submissionCount: number;
  bestScore: number;
}
