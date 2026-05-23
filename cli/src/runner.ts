import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { judgeExecutePython } from './judges/executePython.js';
import { judgeExecutePythonSnippet } from './judges/executePythonSnippet.js';
import { judgeExactFinalLine } from './judges/exactFinalLine.js';
import { judgeJsonMatch } from './judges/jsonMatch.js';
import { judgeAvailable, judgeRubric } from './judges/rubric.js';
import type { LLMProvider, RunSummary, Task, TaskResult, Taxonomy, Testpack } from './types.js';
import { computeCategoryScores, computePipelineScore, determineTier } from './score.js';

const CLI_VERSION = '0.1.0';

export interface RunOptions {
  provider: LLMProvider;
  providerName: string;
  model: string;
  testpack: Testpack;
  taxonomy: Taxonomy;
}

async function runOneTask(task: Task, provider: LLMProvider): Promise<TaskResult> {
  let response = '';
  let latency_ms = 0;
  let tokens_in: number | undefined;
  let tokens_out: number | undefined;
  let error: string | undefined;

  try {
    const r = await provider.complete(task.prompt, { maxTokens: 1024, temperature: 0 });
    response = r.text;
    latency_ms = r.latency_ms;
    tokens_in = r.tokens_in;
    tokens_out = r.tokens_out;
  } catch (e) {
    error = (e as Error).message;
    process.stderr.write(`\n[task ${task.id}] LLM call failed: ${error}\n`);
  }

  // Score
  let raw_score = 0;
  let rationale = '';
  if (error) {
    rationale = `provider error: ${error}`;
  } else {
    try {
      switch (task.judge_type) {
        case 'execute_python': {
          const r = await judgeExecutePython(task, response);
          raw_score = r.score;
          rationale = r.rationale;
          break;
        }
        case 'execute_python_snippet': {
          const r = await judgeExecutePythonSnippet(task, response);
          raw_score = r.score;
          rationale = r.rationale;
          break;
        }
        case 'exact_final_line': {
          const r = judgeExactFinalLine(task, response);
          raw_score = r.score;
          rationale = r.rationale;
          break;
        }
        case 'json_match': {
          const r = judgeJsonMatch(task, response);
          raw_score = r.score;
          rationale = r.rationale;
          break;
        }
        case 'rubric': {
          const r = await judgeRubric(task, response);
          if (r === null) {
            // Judge not available — skip task; signal via NaN so aggregator drops it.
            return {
              task_id: task.id,
              category: task.category,
              prompt: task.prompt,
              response,
              raw_score: NaN,
              passed: false,
              latency_ms,
              tokens_in,
              tokens_out,
              judge_rationale: 'rubric task skipped — no ANTHROPIC_API_KEY for judge',
            };
          }
          raw_score = r.score;
          rationale = r.rationale;
          break;
        }
      }
    } catch (e) {
      rationale = `judge error: ${(e as Error).message}`;
    }
  }

  return {
    task_id: task.id,
    category: task.category,
    prompt: task.prompt,
    response,
    raw_score,
    passed: raw_score >= 7,
    latency_ms,
    tokens_in,
    tokens_out,
    judge_rationale: rationale,
    error,
  };
}

export async function runBenchmark(opts: RunOptions): Promise<RunSummary> {
  const tasks = opts.testpack.tasks;
  process.stdout.write(chalk.dim(`Running ${tasks.length} tasks. Judge available: ${judgeAvailable() ? 'yes' : 'no (rubric tasks will be skipped)'}\n\n`));

  const bar = new cliProgress.SingleBar(
    {
      format: `  ${chalk.cyan('{bar}')} {percentage}% | {value}/{total} | {task}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      stream: process.stdout,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(tasks.length, 0, { task: '' });
  const results: TaskResult[] = [];
  for (const task of tasks) {
    bar.update(results.length, { task: task.id });
    const r = await runOneTask(task, opts.provider);
    // Replace NaN-score tasks with a sentinel that aggregator skips.
    results.push(r);
    bar.update(results.length, { task: task.id });
  }
  bar.stop();

  // For aggregation, drop NaN scores.
  const scoreableResults = results.map((r) => ({ ...r, raw_score: isNaN(r.raw_score) ? 0 : r.raw_score }));
  const usableForCategories = results.filter((r) => !isNaN(r.raw_score));
  const categoryScores = computeCategoryScores(usableForCategories, opts.taxonomy);
  const pipeline_score = computePipelineScore(categoryScores, opts.taxonomy);
  const tier = determineTier(pipeline_score, opts.taxonomy);

  return {
    testpack_version: opts.testpack.version,
    model: opts.model,
    provider: opts.providerName,
    cli_version: CLI_VERSION,
    pipeline_score,
    tier: tier.id,
    category_scores: categoryScores,
    task_results: scoreableResults,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
}
