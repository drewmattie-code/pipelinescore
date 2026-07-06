import chalk from 'chalk';
import { createInterface } from 'node:readline/promises';
import { isPlaceholderNickname } from './util.js';

const NICKNAME_RE = /^[a-zA-Z0-9._-]{2,40}$/;

/**
 * Zero-config entry point: `npx @pipelinescore/cli` with no arguments.
 *
 * Most people bounce off a required-flags CLI before their first run. The
 * wizard removes every decision that can be detected: it probes the common
 * local servers, lists the models they're actually serving, and asks only
 * what it must (which model, what nickname). Power users and CI keep the
 * explicit `run` subcommand.
 */

interface ProbeTarget {
  name: string;
  probe: string;
  endpoint: string;
  kind: 'ollama' | 'openai';
}

const PROBE_TARGETS: ProbeTarget[] = [
  { name: 'Ollama', probe: 'http://localhost:11434/api/tags', endpoint: 'http://localhost:11434/v1', kind: 'ollama' },
  { name: 'LM Studio', probe: 'http://localhost:1234/v1/models', endpoint: 'http://localhost:1234/v1', kind: 'openai' },
  { name: 'llama.cpp / LiteLLM (:8080)', probe: 'http://localhost:8080/v1/models', endpoint: 'http://localhost:8080/v1', kind: 'openai' },
  { name: 'MLX-Omni', probe: 'http://localhost:10240/v1/models', endpoint: 'http://localhost:10240/v1', kind: 'openai' },
  { name: 'vLLM / LiteLLM (:8000)', probe: 'http://localhost:8000/v1/models', endpoint: 'http://localhost:8000/v1', kind: 'openai' },
  { name: 'LiteLLM (:4000)', probe: 'http://localhost:4000/v1/models', endpoint: 'http://localhost:4000/v1', kind: 'openai' },
];

// Embedding / reranker models can't chat; hide them from the pick list.
const NON_CHAT_RE = /embed|embedding|rerank|whisper|clip\b/i;

export interface DetectedServer {
  name: string;
  endpoint: string;
  models: string[];
}

export interface WizardChoice {
  model: string;
  endpoint: string;
  user?: string;
  submit: boolean;
}

async function probeOne(t: ProbeTarget, timeoutMs = 700): Promise<DetectedServer | null> {
  try {
    const res = await fetch(t.probe, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      models?: Array<{ name?: string }>;
      data?: Array<{ id?: string }>;
    };
    const models =
      t.kind === 'ollama'
        ? (json.models ?? []).map((m) => m.name ?? '').filter(Boolean)
        : (json.data ?? []).map((m) => m.id ?? '').filter(Boolean);
    const chatModels = models.filter((m) => !NON_CHAT_RE.test(m));
    if (chatModels.length === 0) return null;
    return { name: t.name, endpoint: t.endpoint, models: chatModels };
  } catch {
    return null;
  }
}

export async function detectServers(): Promise<DetectedServer[]> {
  const results = await Promise.all(PROBE_TARGETS.map((t) => probeOne(t)));
  return results.filter((r): r is DetectedServer => r !== null);
}

function noServersHelp(): string {
  return [
    chalk.bold('No local model server found.'),
    '',
    'The wizard looks for Ollama (:11434), LM Studio (:1234), llama.cpp (:8080),',
    'MLX-Omni (:10240), and vLLM/LiteLLM (:8000/:4000) on localhost.',
    '',
    `Start one first — e.g. ${chalk.cyan('ollama serve')} or LM Studio's local server —`,
    'then rerun. Or point the CLI anywhere yourself:',
    '',
    chalk.cyan('  npx @pipelinescore/cli run --provider local \\'),
    chalk.cyan('    --endpoint http://localhost:11434/v1 --model <model-id>'),
    '',
    `Full guide: ${chalk.cyan('https://pipelinescore.ai/run')}`,
  ].join('\n');
}

/**
 * Run the interactive flow. Returns the user's choices, or null when the
 * wizard can't run (no TTY, no servers, aborted) — the caller decides exit.
 * savedNickname comes from ~/.config/pipelinescore/config.json when present.
 */
export async function runWizard(savedNickname?: string): Promise<WizardChoice | null> {
  process.stdout.write(
    `${chalk.bold('PipelineScore')} ${chalk.dim('— zero-config benchmark')}\n` +
      chalk.dim('Scanning localhost for model servers…\n'),
  );

  const servers = await detectServers();

  if (servers.length === 0) {
    process.stdout.write('\n' + noServersHelp() + '\n');
    return null;
  }

  // Non-interactive callers (CI, agents) get the detection result and a
  // ready-to-paste command instead of a hung prompt.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write('\nDetected servers:\n');
    for (const s of servers) {
      process.stdout.write(`  ${s.name} — ${s.endpoint} (${s.models.length} model${s.models.length === 1 ? '' : 's'})\n`);
    }
    const first = servers[0];
    process.stdout.write(
      '\nNo TTY, so skipping the interactive wizard. Run explicitly:\n' +
        chalk.cyan(
          `  npx @pipelinescore/cli run --provider local --endpoint ${first.endpoint} --model ${first.models[0]}\n`,
        ),
    );
    return null;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    // 1. Server
    let server = servers[0];
    if (servers.length === 1) {
      process.stdout.write(
        `Found ${chalk.bold(server.name)} at ${chalk.cyan(server.endpoint)} — ${server.models.length} model${server.models.length === 1 ? '' : 's'}.\n\n`,
      );
    } else {
      process.stdout.write('\nFound more than one server:\n');
      servers.forEach((s, i) => {
        process.stdout.write(`  ${chalk.bold(String(i + 1))}. ${s.name} — ${s.endpoint} (${s.models.length} models)\n`);
      });
      const answer = (await rl.question(`Which server? [1-${servers.length}, Enter = 1]: `)).trim();
      const idx = answer === '' ? 0 : Number.parseInt(answer, 10) - 1;
      server = servers[Number.isInteger(idx) && idx >= 0 && idx < servers.length ? idx : 0];
      process.stdout.write('\n');
    }

    // 2. Model
    let model = server.models[0];
    if (server.models.length > 1) {
      const shown = server.models.slice(0, 20);
      process.stdout.write('Models on this server:\n');
      shown.forEach((m, i) => {
        process.stdout.write(`  ${chalk.bold(String(i + 1))}. ${m}\n`);
      });
      if (server.models.length > shown.length) {
        process.stdout.write(chalk.dim(`  …and ${server.models.length - shown.length} more (type the exact name)\n`));
      }
      const answer = (await rl.question(`Which model? [1-${server.models.length} or name, Enter = 1]: `)).trim();
      if (answer !== '') {
        const idx = Number.parseInt(answer, 10) - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < server.models.length && String(idx + 1) === answer) {
          model = server.models[idx];
        } else {
          const byName = server.models.find((m) => m === answer) ?? server.models.find((m) => m.includes(answer));
          if (byName) model = byName;
          else process.stdout.write(chalk.yellow(`No model matching "${answer}" — using ${model}.\n`));
        }
      }
      process.stdout.write('\n');
    }

    // 3. Nickname
    let user = savedNickname;
    if (user) {
      process.stdout.write(`Submitting as ${chalk.bold(user)} ${chalk.dim('(saved — override with run --user <name>)')}\n`);
    } else {
      for (let attempt = 0; attempt < 3; attempt++) {
        const answer = (await rl.question('Leaderboard nickname (Enter = stay anonymous): ')).trim();
        if (answer === '') break;
        if (!NICKNAME_RE.test(answer)) {
          process.stdout.write(chalk.yellow('2-40 chars of letters, digits, . _ - please.\n'));
          continue;
        }
        if (isPlaceholderNickname(answer)) {
          process.stdout.write(chalk.yellow(`"${answer}" is a docs placeholder — pick something that's actually yours.\n`));
          continue;
        }
        user = answer;
        break;
      }
    }

    // 4. Confirm
    const submitAnswer = (
      await rl.question(
        `\nRun 34 tasks against ${chalk.bold(model)} and submit to the public leaderboard? [Y/n]: `,
      )
    )
      .trim()
      .toLowerCase();
    const submit = submitAnswer === '' || submitAnswer === 'y' || submitAnswer === 'yes';
    if (!submit) {
      process.stdout.write(chalk.dim('OK — running locally, nothing will be uploaded.\n'));
    }
    process.stdout.write('\n');

    return { model, endpoint: server.endpoint, user, submit };
  } finally {
    rl.close();
  }
}
