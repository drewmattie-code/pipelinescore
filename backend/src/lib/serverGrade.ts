// Authoritative, server-side scoring of a submission.
//
// Deterministic tasks (code execution, exact-match, json-match) are scored by
// the CLI locally — those are objective and reproducible, so their client score
// is trusted. Rubric (subjective) tasks are graded HERE with the lab's judge, so
// users never need their own key. The composite + confidence bands are then
// recomputed from the combined results, and that server number is what lands on
// the board. If no judge key is configured, it falls back to the client's
// rubric scores so submissions still work.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRun, type ScoreInput, type ScoreTaxonomy, type ScoreV2 } from './score.js';
import { gradeRubric, judgeAvailable } from './judge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BENCH = resolve(__dirname, '..', '..', '..', 'benchmarks');

interface TaskDef { id: string; category: string; judge_type: string; prompt: string; rubric?: string[] }
const tasks: TaskDef[] = JSON.parse(readFileSync(resolve(BENCH, 'tasks-v2.json'), 'utf8')).tasks;
const taxonomy: ScoreTaxonomy = JSON.parse(readFileSync(resolve(BENCH, 'taxonomy.json'), 'utf8'));
const taskById = new Map(tasks.map((t) => [t.id, t]));

export interface SubTaskResult {
  task_id: string;
  category: string;
  model_output?: string;
  judge_score?: number | null;
  latency_ms?: number | null;
  tokens_used?: number | null;
}

export interface GradedResult {
  score: ScoreV2;
  graded: Map<string, { score: number; stddev: number; rationale: string }>;
}

export async function serverGrade(taskResults: SubTaskResult[]): Promise<GradedResult> {
  const inputs: ScoreInput[] = [];
  const graded = new Map<string, { score: number; stddev: number; rationale: string }>();
  const canGrade = judgeAvailable();

  for (const tr of taskResults) {
    const task = taskById.get(tr.task_id);
    const clientScore = typeof tr.judge_score === 'number' && !Number.isNaN(tr.judge_score) ? tr.judge_score : null;
    const base = { category: tr.category, latency_ms: tr.latency_ms ?? 0, tokens_out: tr.tokens_used ?? null };

    if (task?.judge_type === 'rubric') {
      if (canGrade) {
        const g = await gradeRubric({ prompt: task.prompt, rubric: task.rubric ?? [] }, tr.model_output ?? '');
        if (g) {
          graded.set(tr.task_id, g);
          inputs.push({ ...base, raw_score: g.score, score_stddev: g.stddev });
          continue;
        }
      }
      // Could not grade server-side: use the client's local preview if it has
      // one, otherwise SKIP the task (do not count an ungraded rubric task as 0,
      // which would wrongly tank the category — the v2 engine renormalizes a
      // missing category out of the composite).
      if (clientScore === null) continue;
      inputs.push({ ...base, raw_score: clientScore, score_stddev: 0 });
      continue;
    }

    // Deterministic task: trust the client's objective score.
    inputs.push({ ...base, raw_score: clientScore ?? 0, score_stddev: 0 });
  }

  return { score: scoreRun(inputs, taxonomy), graded };
}
