#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import { spawn } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { LocalProvider } from './providers/local.js';
import { fetchTestpack, loadLocalTaxonomy, loadLocalTestpack } from './testpack.js';
import { loadHoldout } from './holdout.js';
import { runBenchmark } from './runner.js';
import { renderCard } from './card.js';
import { determineTier } from './score.js';
import type { LLMProvider } from './types.js';
import { detectHardware, checkModelFit, type HardwareInfo } from './hardware.js';

const CONFIG_PATH = resolve(homedir(), '.config', 'pipelinescore', 'config.json');
const NICKNAME_RE = /^[a-zA-Z0-9._-]{2,40}$/;
const CONFIG_TAG_RE = /^[a-zA-Z0-9._-]{2,60}$/;
const HARDWARE_TAG_RE = /^[a-zA-Z0-9._-]{2,60}$/;

interface SavedConfig {
  user_nickname?: string;
  config_tag?: string;
  hardware_tag?: string;
}

function loadSavedConfig(): SavedConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as SavedConfig;
    return raw;
  } catch {
    return {};
  }
}

function saveConfig(next: SavedConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const current = loadSavedConfig();
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...next }, null, 2));
}

/**
 * Open a URL in the user's default browser. Fire-and-forget — never blocks the
 * benchmark flow on a missing browser. Honors $BROWSER if set.
 */
function openUrl(url: string): void {
  const envBrowser = process.env.BROWSER;
  let cmd: string;
  let args: string[];
  if (envBrowser) {
    cmd = envBrowser;
    args = [url];
  } else {
    switch (platform()) {
      case 'darwin':
        cmd = 'open';
        args = [url];
        break;
      case 'win32':
        cmd = 'cmd';
        // start "" forces a fresh console; the empty title arg is intentional.
        args = ['/c', 'start', '""', url];
        break;
      default:
        cmd = 'xdg-open';
        args = [url];
    }
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      // Silently swallow — auto-open is a nicety, not a requirement.
    });
    child.unref();
  } catch {
    // Ignore — never block the CLI on a missing browser.
  }
}

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
  .option('--backend <url>', 'PipelineScore backend URL', 'https://api.pipelinescore.ai')
  .option('--holdout <path>', 'private held-out task pool for lab-verified runs (or set PS_HOLDOUT_FILE)')
  .option('--seed <seed>', 'rotation seed for the held-out subset (lab runs; makes selection reproducible)')
  .option('--lab-key <key>', 'lab key to request the lab-verified flag (must match the backend LAB_KEY)')
  .option('--user <nickname>', 'your public leaderboard nickname (alphanum + . _ -, 2–40 chars)')
  .option(
    '--config-tag <tag>',
    'differentiator for this configuration (LoRA adapter, system prompt, skill, persona, etc.)'
  )
  .option(
    '--hardware-tag <tag>',
    "your hardware (e.g. 'm3-max-128gb', 'rtx-3090', 'a100-80gb'); auto-detected on local runs if omitted"
  )
  .option('--no-submit', 'do not POST results to the backend')
  .option(
    '--no-open',
    "do not auto-open the user's leaderboard page in the browser after submit"
  )
  .option(
    '--site <url>',
    'PipelineScore web URL (used for the auto-opened profile page)',
    'https://pipelinescore.ai'
  )
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
  site: string;
  user?: string;
  configTag?: string;
  hardwareTag?: string;
  holdout?: string;
  seed?: string;
  labKey?: string;
  submit: boolean;
  open: boolean;
}

async function runCommand(opts: RunCommandOptions): Promise<void> {
  const providerName = opts.provider.toLowerCase();

  // Resolve nickname + config_tag + hardware_tag: flag > saved config > none. Validate + persist.
  const saved = loadSavedConfig();
  let nickname: string | undefined = opts.user ?? saved.user_nickname;
  if (nickname && !NICKNAME_RE.test(nickname)) {
    throw new Error(`Invalid nickname "${nickname}". Use 2-40 chars of [a-zA-Z0-9._-].`);
  }
  let configTag: string | undefined = opts.configTag ?? saved.config_tag;
  if (configTag && !CONFIG_TAG_RE.test(configTag)) {
    throw new Error(`Invalid --config-tag "${configTag}". Use 2-60 chars of [a-zA-Z0-9._-].`);
  }
  let hardwareTag: string | undefined = opts.hardwareTag ?? saved.hardware_tag;
  if (hardwareTag && !HARDWARE_TAG_RE.test(hardwareTag)) {
    throw new Error(`Invalid --hardware-tag "${hardwareTag}". Use 2-60 chars of [a-zA-Z0-9._-].`);
  }

  // For local runs the model executes on this machine, so auto-detect a stable
  // hardware tag when the user did not supply one. Frontier API runs execute in
  // the provider's cloud, so we leave their hardware unspecified.
  let hardwareAutoDetected = false;
  let hardware: HardwareInfo | null = null;
  if (providerName === 'local') {
    hardware = detectHardware();
    if (!hardwareTag && hardware.tag) {
      hardwareTag = hardware.tag;
      hardwareAutoDetected = true;
    }
  }

  const persist: SavedConfig = {};
  if (opts.user && nickname) persist.user_nickname = nickname;
  if (opts.configTag && configTag) persist.config_tag = configTag;
  if (opts.hardwareTag && hardwareTag) persist.hardware_tag = hardwareTag;
  if (Object.keys(persist).length > 0) saveConfig(persist);

  // Banner
  process.stdout.write(
    boxen(
      `${chalk.bold('PipelineScore')} ${chalk.dim('v0.1.0')}\n` +
        `${chalk.dim('Provider:')}     ${providerName}\n` +
        `${chalk.dim('Model:')}        ${opts.model}\n` +
        `${chalk.dim('Hardware:')}     ${hardwareTag ? `${hardwareTag}${hardwareAutoDetected ? chalk.dim(' (auto-detected)') : ''}` : chalk.italic.dim('— (use --hardware-tag for local-hardware comparisons)')}\n` +
        `${chalk.dim('Config tag:')}   ${configTag ?? chalk.italic.dim('— (base model, no customization)')}\n` +
        `${chalk.dim('User:')}         ${nickname ?? chalk.italic.dim('anonymous (use --user to claim a nickname)')}\n` +
        `${chalk.dim('Submit:')}       ${opts.submit ? 'yes' : 'no'}`,
      { padding: { top: 0, bottom: 0, left: 1, right: 1 }, borderStyle: 'round', borderColor: 'cyan' },
    ) + '\n',
  );

  // Lightweight model-fit heads-up for local runs (rough estimate; see llmfit
  // for accurate scoring).
  if (providerName === 'local' && hardware) {
    const fit = checkModelFit(opts.model, hardware);
    if (fit && !fit.fits) {
      process.stderr.write(
        chalk.yellow(
          `Heads up: ${opts.model} looks like ~${fit.modelParamsB}B params ` +
            `(~${fit.estRequiredGb}GB at q4), but this machine has ~${fit.budgetGb}GB ${fit.budgetKind.toUpperCase()}. ` +
            `It may not load, or will run slowly.\n`,
        ) +
          chalk.dim('  Rough estimate. For accurate model-fit scoring see llmfit: https://github.com/AlexsJones/llmfit\n'),
      );
    }
  }

  // Resolve provider
  const provider = buildProvider(providerName, opts);

  // Load testpack. The benchmark we EXECUTE is always the local, bundled,
  // npm-integrity-checked testpack — never a network payload. The judges run
  // task-defined Python (see judges/executePython*), so executing a fetched
  // testpack would let a compromised or spoofed backend run arbitrary code on
  // the user's machine. The backend fetch is used ONLY as a non-executing
  // version check that nudges the user to upgrade when a newer pack is published.
  const taxonomy = await loadLocalTaxonomy();
  let testpack: Awaited<ReturnType<typeof loadLocalTestpack>>;
  const holdoutPath = opts.holdout ?? process.env.PS_HOLDOUT_FILE;
  if (holdoutPath) {
    // Lab-verified path: execute a seed-rotated subset of the private held-out
    // pool. Still local (no untrusted network testpack); the pool is the lab's.
    testpack = await loadHoldout(holdoutPath, opts.seed ?? 'lab', 5);
    process.stdout.write(chalk.dim(`Using private held-out testpack ${testpack.version} (lab run).\n`));
  } else {
    testpack = await loadLocalTestpack();
    process.stdout.write(chalk.dim(`Using bundled testpack ${testpack.version}.\n`));
    const remote = await fetchTestpack(opts.backend);
    if (remote?.version && remote.version !== testpack.version) {
      process.stdout.write(
        chalk.yellow(
          `A newer testpack (${remote.version}) is published; you're on ${testpack.version}. ` +
          `Upgrade for the latest tasks: npm i -g @pipelinescore/cli\n`,
        ),
      );
    }
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
    // Build the payload in the backend's contract (model as an object, per-task
    // results as task_input/model_output). The old code spread the raw summary,
    // whose shapes did not match, so every real submission was rejected (400).
    const slug = opts.model.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-model';
    const payload = {
      model: {
        slug,
        display_name: opts.model,
        provider: providerName,
        provider_model: opts.model,
      },
      testpack_version: summary.testpack_version,
      pipeline_score: summary.pipeline_score,
      tier: summary.tier,
      category_scores: summary.category_scores,
      score_detail: summary.score_detail,
      cli_version: summary.cli_version,
      task_results: summary.task_results.map((r) => ({
        task_id: r.task_id,
        category: r.category,
        task_input: r.prompt,
        model_output: r.response,
        judge_score: Number.isNaN(r.raw_score) ? null : r.raw_score,
        passed: r.passed,
        latency_ms: r.latency_ms,
        tokens_used: r.tokens_out ?? null,
        judge_rationale: r.judge_rationale ?? null,
      })),
      user_nickname: nickname,
      config_tag: configTag,
      hardware_tag: hardwareTag,
    };
    try {
      const res = await fetch(`${opts.backend}/v1/submissions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(opts.labKey ? { 'x-lab-key': opts.labKey as string } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; url?: string };
        if (data.url) shareUrl = data.url;
        else if (data.id) shareUrl = `${opts.site}/s/${data.id}`;
      } else if (res.status === 429) {
        const retry = res.headers.get('retry-after');
        let layer = 'unknown';
        try {
          const body = (await res.json()) as { layer?: string };
          if (body.layer) layer = body.layer;
        } catch {
          /* ignore parse failure */
        }
        const human =
          retry && Number(retry) > 0
            ? `${Math.ceil(Number(retry) / 60)} min`
            : 'a while';
        process.stderr.write(
          chalk.yellow(
            `Submission rate-limited (layer: ${layer}). Try again in ${human}.\n` +
              chalk.dim('  Score still computed locally — only the upload was blocked.\n'),
          ),
        );
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

  // Pop the user over to the site so they can see their ranking.
  if (opts.submit && opts.open && shareUrl) {
    // Prefer the user's profile page (where they'll see their rank in context),
    // fall back to the leaderboard, then the per-submission share URL.
    const profileUrl = nickname
      ? `${opts.site}/users/${encodeURIComponent(nickname)}`
      : `${opts.site}/leaderboard/users`;
    process.stdout.write(
      chalk.dim(`Opening your leaderboard page: ${chalk.cyan(profileUrl)}\n`),
    );
    openUrl(profileUrl);
  } else if (opts.submit && shareUrl) {
    process.stdout.write(
      chalk.dim(
        `See your run: ${chalk.cyan(
          nickname ? `${opts.site}/users/${encodeURIComponent(nickname)}` : `${opts.site}/leaderboard/users`,
        )}\n`,
      ),
    );
  } else if (!opts.submit) {
    process.stdout.write(
      chalk.dim(
        `Score stayed local (--no-submit). Claim your spot: rerun without --no-submit and join ${chalk.cyan(`${opts.site}/leaderboard`)}\n`,
      ),
    );
  }

  // One honest ask, at the exact moment the tool has just proven its worth.
  process.stdout.write(
    chalk.dim(
      `Useful? A star helps others find it: ${chalk.cyan('https://github.com/drewmattie-code/pipelinescore')} ${chalk.yellow('★')}\n`,
    ),
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
