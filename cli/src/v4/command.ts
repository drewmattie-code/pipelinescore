import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { normalizeLocalEndpoint, cliVersion } from '../util.js';
import { AnthropicChatProvider, OpenAIChatProvider } from './providers.js';
import { newSeed } from './rng.js';
import { runTask, summarize } from './runner.js';
import { DockerSandbox, dockerStatus, ensureImages } from './sandbox.js';
import { TESTPACK_V4_VERSION, V4_TASKS } from './tasks/index.js';
import type { ChatProvider, V4Summary, V4TaskResult } from './types.js';

export interface V4Options {
  provider: string;
  model: string;
  endpoint?: string;
  apiKey?: string;
  seed?: string;
  only?: string;
  save?: string;
}

const MINIMAX_DEFAULT = 'https://api.minimax.io/v1';

function minimaxKey(): string | undefined {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  const p = resolve(homedir(), '.config', 'minimax', 'api_key');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : undefined;
}

export function buildChatProvider(o: V4Options): ChatProvider {
  switch (o.provider) {
    case 'local':
      return new OpenAIChatProvider('local', o.model, { baseURL: normalizeLocalEndpoint(o.endpoint ?? 'http://localhost:11434/v1'), apiKey: o.apiKey });
    case 'openai':
      return new OpenAIChatProvider('openai', o.model, { baseURL: o.endpoint, apiKey: o.apiKey ?? process.env.OPENAI_API_KEY });
    case 'minimax': {
      const key = o.apiKey ?? minimaxKey();
      if (!key) throw new Error('MiniMax needs a key: set MINIMAX_API_KEY or put it in ~/.config/minimax/api_key');
      return new OpenAIChatProvider('minimax', o.model, { baseURL: o.endpoint ?? MINIMAX_DEFAULT, apiKey: key });
    }
    case 'anthropic': {
      const key = o.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('Anthropic needs ANTHROPIC_API_KEY or --api-key');
      return new AnthropicChatProvider('anthropic', o.model, { baseURL: o.endpoint, apiKey: key });
    }
    default:
      throw new Error(`unknown provider "${o.provider}" (use local, openai, minimax or anthropic)`);
  }
}

export async function runV4(o: V4Options): Promise<V4Summary> {
  const docker = dockerStatus();
  if (!docker.ok) {
    throw new Error(`PipelineScore v4 runs model-written code only inside a Docker sandbox. ${docker.reason}`);
  }
  ensureImages();
  const provider = buildChatProvider(o);
  const seed = o.seed ?? newSeed();
  const tasks = o.only ? V4_TASKS.filter((t) => o.only!.split(',').includes(t.id)) : V4_TASKS;
  const ctx = { sandbox: new DockerSandbox() };
  const started_at = new Date().toISOString();

  process.stdout.write(chalk.dim(`PipelineScore v4 ${TESTPACK_V4_VERSION} · ${tasks.length} tasks · seed ${seed} · ${provider.name}/${provider.model}\n\n`));
  const results: V4TaskResult[] = [];
  for (const t of tasks) {
    process.stdout.write(`  ${t.id.padEnd(28)} `);
    const r = await runTask(t, seed, provider, ctx);
    results.push(r);
    const mark = r.error ? chalk.red('ERROR') : r.score >= 0.999 ? chalk.green('PASS ') : r.score > 0 ? chalk.yellow('PART ') : chalk.red('FAIL ');
    process.stdout.write(`${mark} ${(r.score * 100).toFixed(0).padStart(3)}  ${String(r.turns).padStart(2)}t ${(r.latency_ms / 1000).toFixed(1).padStart(6)}s  ${chalk.dim((r.error ?? r.detail).slice(0, 110))}\n`);
  }

  const summary: V4Summary = {
    testpack_version: TESTPACK_V4_VERSION,
    seed,
    model: provider.model,
    provider: provider.name,
    cli_version: cliVersion(),
    ...summarize(results),
    task_results: results,
    started_at,
    finished_at: new Date().toISOString(),
  };

  process.stdout.write(`\n  ${chalk.bold('PipelineScore v4')}  ${chalk.bold(summary.pipeline_score.toFixed(1))}  ${chalk.dim('(quality only)')}\n`);
  for (const [s, v] of Object.entries(summary.suite_scores)) {
    if (v.n) process.stdout.write(`    ${s.padEnd(9)} ${v.mean.toFixed(1).padStart(5)}  ${chalk.dim(`[${v.ci_low}–${v.ci_high}] n=${v.n}`)}\n`);
  }
  process.stdout.write(`    ${'speed'.padEnd(9)} ${summary.speed.tps_p50 ?? '—'} tok/s  ${chalk.dim(`${summary.speed.wall_s}s model time`)}\n`);

  if (o.save) {
    writeFileSync(o.save, JSON.stringify(summary, null, 2));
    process.stdout.write(chalk.dim(`\n  saved → ${o.save}\n`));
  }
  return summary;
}
