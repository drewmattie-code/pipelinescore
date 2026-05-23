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
}
