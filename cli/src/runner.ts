import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { judgeExecutePython } from './judges/executePython.js';
import { judgeExecutePythonSnippet } from './judges/executePythonSnippet.js';
import { judgeExactFinalLine } from './judges/exactFinalLine.js';
import { judgeJsonMatch } from './judges/jsonMatch.js';
import { stripReasoning } from './normalize.js';
import type { LLMProvider, RunSummary, Task, TaskResult, Taxonomy, Testpack } from './types.js';
import { scoreRun } from './score.js';
import { cliVersion } from './util.js';

const CLI_VERSION = cliVersion();

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
  let score_stddev = 0;

  try {
    // 2048, not 1024: reasoning models spend output tokens thinking before the
    // final answer, and a starved budget returns empty content on hard tasks.
    const r = await provider.complete(task.prompt, { maxTokens: 2048, temperature: 0 });
    // Judge the answer, not the scratchpad. Some servers strip a reasoning
    // model's channels for you and some hand them back raw; without this the
    // server you happen to run decides your score more than your hardware does.
    response = stripReasoning(r.text);
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
          // The testpack is fully deterministic (no judge, no key). A rubric
          // task is unsupported and skipped (NaN drops it from scoring).
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
            judge_rationale: 'rubric tasks are not supported in the deterministic testpack',
          };
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
    score_stddev,
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
  process.stdout.write(chalk.dim(
    `Running ${tasks.length} tasks locally. No API key needed — every task is scored on your machine.\n\n`,
  ));

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
    results.push(r);
    bar.update(results.length, { task: task.id });
  }
  bar.stop();

  // Fully local scoring: confidence bands, throughput speed, per-profile
  // composites — all computed on the user's machine, then uploaded.
  const v2 = scoreRun(results, opts.taxonomy);

  return {
    testpack_version: opts.testpack.version,
    model: opts.model,
    provider: opts.providerName,
    cli_version: CLI_VERSION,
    pipeline_score: v2.pipeline_score,
    tier: v2.tier,
    category_scores: v2.category_scores,
    score_detail: v2,
    task_results: results,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
}
