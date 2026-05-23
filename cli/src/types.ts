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
}

export interface TaskResult {
  task_id: string;
  category: Category;
  prompt: string;
  response: string;
  raw_score: number; // 0-10
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
