import { taskRng } from './rng.js';
import { TESTPACK_V4_VERSION, V4_TASKS } from './tasks/index.js';
import type { Suite, V4Summary } from './types.js';

// A router-neutral export of v4 results: which model is good at which kind of
// request, on which hardware. Routers (the Weave fork, Experiential, anything
// else) read this through small adapters; the format is the contract.
export const PROFILE_FORMAT = 'pipelinescore-routing-profile/1';

export interface ProfileModel {
  id: string; // model id as the serving endpoint knows it
  provider: string; // local | minimax | openai | anthropic | ...
  location: 'local' | 'cloud';
  hardware_tag: string;
  pipeline_score: number;
  suites: Record<Suite, { mean: number; ci_low: number; ci_high: number; n: number }>;
  tasks: Array<{ task_id: string; suite: Suite; score: number }>;
  speed: { tps_p50: number | null };
  runs: number; // result files merged into this entry
  seeds: string[];
  // Optional per-million-token prices a user can fill in so routers can trade quality for cost.
  price_per_1m?: { input: number; output: number };
}

export interface RoutingProfile {
  format: typeof PROFILE_FORMAT;
  testpack_version: string;
  generated_at: string;
  models: ProfileModel[];
  // Representative prompts per suite so a router can place live requests next to
  // the kind of task each score came from (e.g. embed them as cluster seeds).
  suite_examples: Record<Suite, string[]>;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Runs of the same model on the same hardware are merged (per-task scores
// averaged); aborted runs and runs from another testpack version are refused.
export function buildProfile(runs: V4Summary[], opts: { examplesPerSuite?: number; now?: Date } = {}): RoutingProfile {
  const bad = runs.filter((r) => r.aborted);
  if (bad.length) throw new Error(`refusing aborted run(s): ${bad.map((r) => `${r.model} (${r.aborted})`).join('; ')}`);
  const versions = new Set(runs.map((r) => r.testpack_version));
  if (versions.size > 1) throw new Error(`runs come from different testpack versions: ${[...versions].join(', ')}`);
  if (runs.length === 0) throw new Error('no runs given');

  const groups = new Map<string, V4Summary[]>();
  for (const r of runs) {
    const key = `${r.provider}|${r.model}|${r.hardware_tag}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const models: ProfileModel[] = [...groups.values()].map((rs) => {
    const first = rs[0];
    const byTask = new Map<string, { suite: Suite; scores: number[] }>();
    for (const r of rs) for (const t of r.task_results) {
      const e = byTask.get(t.task_id) ?? { suite: t.suite, scores: [] };
      e.scores.push(t.score);
      byTask.set(t.task_id, e);
    }
    const tasks = [...byTask.entries()].map(([task_id, e]) => ({ task_id, suite: e.suite, score: +mean(e.scores).toFixed(4) }));
    // One run: keep its confidence bands. Several: average means, widen to the outer bands.
    const suites = {} as ProfileModel['suites'];
    for (const s of Object.keys(first.suite_scores) as Suite[]) {
      const vs = rs.map((r) => r.suite_scores[s]).filter((v) => v && v.n > 0);
      if (!vs.length) continue;
      suites[s] = {
        mean: +mean(vs.map((v) => v.mean)).toFixed(2),
        ci_low: Math.min(...vs.map((v) => v.ci_low)),
        ci_high: Math.max(...vs.map((v) => v.ci_high)),
        n: vs[0].n,
      };
    }
    const tps = rs.map((r) => r.speed.tps_p50).filter((x): x is number => x !== null);
    return {
      id: first.model,
      provider: first.provider,
      location: first.hardware_tag === 'cloud' ? 'cloud' : 'local',
      hardware_tag: first.hardware_tag,
      pipeline_score: +mean(rs.map((r) => r.pipeline_score)).toFixed(2),
      suites,
      tasks,
      speed: { tps_p50: tps.length ? +mean(tps).toFixed(1) : null },
      runs: rs.length,
      seeds: rs.map((r) => r.seed),
    };
  });

  const k = opts.examplesPerSuite ?? 3;
  const suite_examples = {} as RoutingProfile['suite_examples'];
  for (const t of V4_TASKS) {
    const list = (suite_examples[t.suite] ??= []);
    if (list.length >= k * 4) continue;
    const inst = t.build(taskRng('profile-examples', t.id));
    const user = inst.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    // Long documents would swamp an embedder; keep the question end, which carries the intent.
    list.push(user.length > 1200 ? user.slice(-1200) : user);
  }

  return {
    format: PROFILE_FORMAT,
    testpack_version: [...versions][0] ?? TESTPACK_V4_VERSION,
    generated_at: (opts.now ?? new Date()).toISOString(),
    models: models.sort((a, b) => b.pipeline_score - a.pipeline_score),
    suite_examples,
  };
}
