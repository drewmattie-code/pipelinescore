// v4 testpack contracts. Tasks are code, not JSON: templated tasks draw fresh
// values from a seeded RNG each run, so answers can't be memorized from the
// public repo while any run stays reproducible from its recorded seed.

export type Suite = 'code' | 'repo' | 'agent' | 'fncall' | 'reason' | 'longdoc' | 'instruct';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  // Raw argument text when the model emitted something that isn't a JSON object.
  // Kept so graders can fail it explicitly instead of seeing an empty call.
  invalid?: string;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
}

export interface ChatProvider {
  name: string;
  model: string;
  // Raises every task's output cap to at least this, so reasoning models that
  // think at length are never cut off before they answer.
  maxOutputTokens?: number;
  chat(messages: ChatMessage[], opts: { tools?: ToolDef[]; maxTokens: number }): Promise<ChatResponse>;
}

export interface Rng {
  next(): number; // [0, 1)
  int(lo: number, hi: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
  shuffle<T>(xs: readonly T[]): T[];
}

export interface Grade {
  score: number; // 0..1, partial credit allowed
  detail: string;
}

export interface SandboxRun {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface Sandbox {
  run(opts: { image: 'python' | 'node'; files: Record<string, string>; cmd: string[]; timeoutMs?: number }): Promise<SandboxRun>;
}

export interface GradeContext {
  sandbox: Sandbox;
}

// One model call, graded on the final response.
export interface SingleInstance {
  kind: 'single';
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
  // What each tool call returns on follow-up turns. Tasks whose later calls
  // depend on an earlier result supply realistic JSON; default is {"ok": true}.
  toolResult?(call: ToolCall): string;
  grade(res: ChatResponse, ctx: GradeContext): Promise<Grade> | Grade;
}

// A multi-turn loop: the model calls tools, the mock world answers, until the
// model stops calling tools or runs out of turns. Graded on the world's end state.
export interface AgentInstance {
  kind: 'agent';
  messages: ChatMessage[];
  tools: ToolDef[];
  maxTurns: number;
  maxTokens?: number;
  handle(call: ToolCall, ctx: GradeContext): Promise<string> | string;
  grade(finalText: string, transcript: ChatMessage[], ctx: GradeContext): Promise<Grade> | Grade;
}

export type TaskInstance = SingleInstance | AgentInstance;

export interface V4Task {
  id: string;
  suite: Suite;
  difficulty: 1 | 2 | 3;
  build(rng: Rng): TaskInstance;
}

export interface V4TaskResult {
  task_id: string;
  suite: Suite;
  score: number; // 0..1
  detail: string;
  response: string; // final model text, truncated, for debugging the grade
  turns: number;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  error?: string;
}

export interface V4Summary {
  testpack_version: string;
  seed: string;
  model: string;
  provider: string;
  // Where the model runs: a detected or given hardware tag for local models, 'cloud' otherwise.
  hardware_tag: string;
  cli_version: string;
  pipeline_score: number; // quality only; speed is reported separately
  suite_scores: Record<Suite, { mean: number; ci_low: number; ci_high: number; n: number }>;
  speed: { tps_p50: number | null; total_tokens_out: number; wall_s: number };
  task_results: V4TaskResult[];
  // Set when the run stopped early because the model server kept failing.
  aborted?: string;
  // Task ids that ended in a provider error (timeouts, 5xx) rather than a graded answer.
  // Such a run is incomplete: rerun those tasks before comparing or submitting.
  provider_errors?: string[];
  started_at: string;
  finished_at: string;
}
