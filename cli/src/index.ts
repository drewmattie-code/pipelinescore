#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { LocalProvider } from './providers/local.js';
import { fetchTestpack, loadLocalTaxonomy, loadLocalTestpack } from './testpack.js';
import { runBenchmark } from './runner.js';
import { renderCard } from './card.js';
import { determineTier } from './score.js';
import type { LLMProvider } from './types.js';

const program = new Command();

program
  .name('ps-bench')
  .description('PipelineScore — run a standardized LLM benchmark against any model')
  .version('0.1.0');

program
  .command('run')
  .description('Run the PipelineScore benchmark against a model')
  .requiredOption('--provider <name>', 'anthropic | openai | local')
  .requiredOption('--model <id>', 'model id (e.g. claude-opus-4-7-20250514, gpt-4o-mini)')
  .option('--api-key <key>', 'API key (defaults to env)')
  .option('--endpoint <url>', 'override endpoint base URL (for local/OpenAI-compatible)')
  .option('--backend <url>', 'PipelineScore backend URL', 'http://localhost:4601')
  .option('--no-submit', 'do not POST results to the backend')
  .action(async (opts) => {
    try {
      await runCommand(opts);
    } catch (e) {
      process.stderr.write(chalk.red(`\nFatal: ${(e as Error).message}\n`));
      process.exit(1);
    }
  });

interface RunCommandOptions {
  provider: string;
  model: string;
  apiKey?: string;
  endpoint?: string;
  backend: string;
  submit: boolean;
}

async function runCommand(opts: RunCommandOptions): Promise<void> {
  const providerName = opts.provider.toLowerCase();

  // Banner
  process.stdout.write(
    boxen(
      `${chalk.bold('PipelineScore')} ${chalk.dim('v0.1.0')}\n` +
        `${chalk.dim('Provider:')} ${providerName}\n` +
        `${chalk.dim('Model:')}    ${opts.model}\n` +
        `${chalk.dim('Submit:')}   ${opts.submit ? 'yes' : 'no'}`,
      { padding: { top: 0, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'cyan' },
    ) + '\n',
  );

  // Resolve provider
  const provider = buildProvider(providerName, opts);

  // Load testpack (try backend, fall back to local)
  const taxonomy = await loadLocalTaxonomy();
  let testpack = await fetchTestpack(opts.backend);
  if (testpack) {
    process.stdout.write(chalk.dim(`Fetched testpack ${testpack.version} from backend.\n`));
  } else {
    testpack = await loadLocalTestpack();
    process.stdout.write(chalk.dim(`Backend unreachable; using local testpack ${testpack.version}.\n`));
  }

  // Run
  const summary = await runBenchmark({
    provider,
    providerName,
    model: opts.model,
    testpack,
    taxonomy,
  });

  // Submit (optional)
  let shareUrl: string | undefined;
  if (opts.submit) {
    try {
      const res = await fetch(`${opts.backend}/v1/submissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(summary),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; url?: string };
        if (data.url) shareUrl = data.url;
        else if (data.id) shareUrl = `https://pipelinescore.ai/s/${data.id}`;
      } else {
        process.stderr.write(chalk.yellow(`Submission failed: ${res.status} ${res.statusText}\n`));
      }
    } catch (e) {
      process.stderr.write(chalk.yellow(`Submission failed: ${(e as Error).message}\n`));
    }
  }

  // Card
  process.stdout.write('\n');
  process.stdout.write(
    renderCard({
      score: summary.pipeline_score,
      tier: determineTier(summary.pipeline_score, taxonomy),
      model: summary.model,
      categoryScores: summary.category_scores,
      taxonomy,
      shareUrl,
    }) + '\n',
  );

  // Quick per-task summary to stderr (so stdout stays clean for piping)
  process.stderr.write('\n' + chalk.dim('Per-task scores:\n'));
  for (const r of summary.task_results) {
    const score = r.raw_score.toFixed(1).padStart(5);
    const symbol = r.passed ? chalk.green('OK  ') : chalk.red('FAIL');
    process.stderr.write(`  ${symbol}  ${r.task_id.padEnd(22)} ${score}/10  ${r.latency_ms}ms  ${chalk.dim((r.judge_rationale ?? '').slice(0, 70))}\n`);
  }

  process.exit(0);
}

function buildProvider(name: string, opts: RunCommandOptions): LLMProvider {
  switch (name) {
    case 'anthropic': {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Anthropic provider requires --api-key or ANTHROPIC_API_KEY env');
      return new AnthropicProvider({ apiKey, model: opts.model });
    }
    case 'openai': {
      const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OpenAI provider requires --api-key or OPENAI_API_KEY env');
      return new OpenAIProvider({ apiKey, model: opts.model, baseURL: opts.endpoint });
    }
    case 'local': {
      return new LocalProvider({
        model: opts.model,
        baseURL: opts.endpoint,
        apiKey: opts.apiKey,
      });
    }
    default:
      throw new Error(`Unknown provider: ${name} (expected anthropic | openai | local)`);
  }
}

program.parseAsync().catch((e) => {
  process.stderr.write(chalk.red(`\nFatal: ${(e as Error).message}\n`));
  process.exit(1);
});
