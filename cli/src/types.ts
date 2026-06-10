export type Category = 'code' | 'reason' | 'write' | 'tool_use' | 'rag';

export type JudgeType =
  | 'execute_python'
  | 'execute_python_snippet'
  | 'exact_final_line'
  | 'json_match'
  | 'rubric';

export interface TestCase {
  input: string;
  expected: string;
}

export interface Task {
  id: string;
  category: Category;
  difficulty: number;
  prompt: string;
  judge_type: JudgeType;
  // execute_python
  test_cases?: TestCase[];
  // execute_python_snippet
  wrapper?: string;
  expected?: unknown;
  // exact_final_line
  expected_pattern?: string;
  // json_match
  ordered?: boolean;
  // rubric
  rubric?: string[];
}

export interface Testpack {
  version: string;
  tasks: Task[];
}

export interface Taxonomy {
  version: string;
  weights: Record<string, number>;
  tiers: Array<{
    id: string;
    name: string;
    min: number;
    max: number;
    color: string;
  }>;
  judge_model: string;
  tasks_per_category: number;
  // v2 additions (optional so a v1 taxonomy still type-checks)
  categories?: string[];
  profiles?: Record<string, Record<string, number>>;
  default_profile?: string;
  speed?: { tps_target: number; min_samples: number };
  judge?: { model: string; samples: number; temperature: number };
}

// v2 scoring detail
export interface CategoryScore {
  mean: number; // 0-100 point estimate
  ci_low: number; // 95% lower bound, clamped 0-100
  ci_high: number; // 95% upper bound, clamped 0-100
  stddev: number; // across-task sample std (0-100)
  n: number; // scorable task count
}

export interface SpeedDetail {
  scored: boolean;
  tps_p50: number | null; // median tokens/sec
  speed_score: number | null; // 0-100, or null when unscored
  samples: number; // task calls that reported token counts
}

export interface ScoreV2 {
  profile: string; // selected profile for the headline composite
  pipeline_score: number; // composite point estimate
  pipeline_ci_low: number;
  pipeline_ci_high: number;
  tier: string;
  category_scores: Record<string, number>; // point estimates (back-compat)
  category_detail: Record<string, CategoryScore>;
  profile_scores: Record<string, number>; // composite point estimate per profile
  speed: SpeedDetail;
}

export interface TaskResult {
  task_id: string;
  category: Category;
  prompt: string;
  response: string;
  raw_score: number; // 0-10
  score_stddev?: number; // within-task judge-sample std on the 0-100 scale (rubric self-consistency); 0 for deterministic judges
  passed: boolean;
  latency_ms: number;
  tokens_in?: number;
  tokens_out?: number;
  judge_rationale?: string;
  error?: string;
}

export interface RunSummary {
  testpack_version: string;
  model: string;
  provider: string;
  cli_version: string;
  pipeline_score: number;
  tier: string;
  category_scores: Record<string, number>;
  score_detail?: ScoreV2; // v2 confidence bands, per-profile composites, throughput speed
  task_results: TaskResult[];
  started_at: string;
  finished_at: string;
}

export interface LLMResponse {
  text: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms: number;
}

export interface LLMProvider {
  name: string;
  complete(prompt: string, opts?: { maxTokens?: number; temperature?: number }): Promise<LLMResponse>;
}
