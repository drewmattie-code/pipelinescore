#!/usr/bin/env node
/**
 * PipelineScore MCP Server
 *
 * Exposes three tools to any MCP-compatible client (Claude Code, Codex, Cursor, etc.):
 *  - run_benchmark          → kicks off a benchmark via the CLI
 *  - get_user_leaderboard   → reads the public user leaderboard
 *  - get_user_profile       → reads a single user's dashboard
 *
 * Communicates with the PipelineScore HTTP API. Default backend is the public
 * production endpoint; override with PIPELINESCORE_BACKEND env var.
 *
 * Stdio transport — meant to be spawned by an MCP host. See the README for setup.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';

const BACKEND = process.env.PIPELINESCORE_BACKEND ?? 'https://api.pipelinescore.ai';

const server = new Server(
  {
    name: 'pipelinescore-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ---- Tool registry ----------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'run_benchmark',
      description:
        'Run the PipelineScore benchmark against an LLM and publish the result to the public leaderboard. ' +
        'Returns the score card output (tier, composite score, per-category scores) and the public share URL. ' +
        'Use when the user wants to benchmark/score/rank a model, or compare two models. ' +
        'Set config_tag when the user is testing a customized version (system prompt, LoRA adapter, persona, RAG setup) so it is differentiated from the base model on the leaderboard.',
      inputSchema: {
        type: 'object',
        required: ['provider', 'model'],
        properties: {
          provider: {
            type: 'string',
            enum: ['anthropic', 'openai', 'local'],
            description: 'The LLM provider. Use "local" for any OpenAI-compatible local endpoint (Ollama, LM Studio, MLX, LiteLLM proxy).',
          },
          model: {
            type: 'string',
            description: 'The model id (e.g. "claude-opus-4-7", "gpt-5.5-2026-04", or a local model name).',
          },
          user: {
            type: 'string',
            description: 'Public leaderboard nickname (alphanum + . _ -, 2-40 chars). Persisted to ~/.config/pipelinescore/config.json after first use.',
          },
          config_tag: {
            type: 'string',
            description: 'Optional. Differentiator for this configuration vs the base model — examples: "system-prompt-coder", "lora-yetti-v8", "temp-zero", "tools-enabled". Persists alongside the nickname.',
          },
          endpoint: {
            type: 'string',
            description: 'Required when provider=local. The OpenAI-compatible base URL.',
          },
          api_key: {
            type: 'string',
            description: 'Optional — defaults to ANTHROPIC_API_KEY / OPENAI_API_KEY env vars.',
          },
        },
      },
    },
    {
      name: 'get_user_leaderboard',
      description:
        'Read the public PipelineScore user leaderboard — every individual benchmark run, sortable and filterable. ' +
        'Use when the user wants to see the current standings, find a specific submission, or check what others have scored.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: 'Filter by provider (anthropic, openai, google, alibaba, etc.).',
          },
          tier: {
            type: 'string',
            enum: ['trunk', 'mainline', 'feeder', 'tap', 'drip'],
            description: 'Filter by tier.',
          },
          user: {
            type: 'string',
            description: 'Filter to a specific nickname.',
          },
          lab_verified: {
            type: 'boolean',
            description: 'Show only lab-verified canonical runs.',
          },
          sort: {
            type: 'string',
            enum: ['score', 'date', 'user', 'model', 'provider', 'tier'],
            description: 'Column to sort by (default: score).',
          },
          dir: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction (default: desc).',
          },
          limit: {
            type: 'number',
            description: 'Max entries to return (default 50, max 500).',
          },
        },
      },
    },
    {
      name: 'get_user_profile',
      description:
        "Read a single PipelineScore user's full dashboard: best score, all submissions, models tried, provider mix, category strengths. " +
        'Use when looking up "what has X user benchmarked" or "what is X user\'s best score".',
      inputSchema: {
        type: 'object',
        required: ['nickname'],
        properties: {
          nickname: {
            type: 'string',
            description: 'The user\'s leaderboard nickname.',
          },
        },
      },
    },
  ],
}));

// ---- Tool implementations ---------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'run_benchmark':
        return await runBenchmark((args ?? {}) as unknown as RunArgs);
      case 'get_user_leaderboard':
        return await getUserLeaderboard((args ?? {}) as unknown as LeaderboardArgs);
      case 'get_user_profile':
        return await getUserProfile((args ?? {}) as unknown as ProfileArgs);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
    };
  }
});

interface RunArgs {
  provider: 'anthropic' | 'openai' | 'local';
  model: string;
  user?: string;
  config_tag?: string;
  endpoint?: string;
  api_key?: string;
}

async function runBenchmark(args: RunArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.provider || !args.model) {
    throw new Error('provider and model are required');
  }
  if (args.provider === 'local' && !args.endpoint) {
    throw new Error('provider=local requires an endpoint URL');
  }

  const cliArgs: string[] = [
    '@pipelinescore/cli',
    'run',
    '--provider',
    args.provider,
    '--model',
    args.model,
    '--backend',
    BACKEND,
  ];
  if (args.user) cliArgs.push('--user', args.user);
  if (args.config_tag) cliArgs.push('--config-tag', args.config_tag);
  if (args.endpoint) cliArgs.push('--endpoint', args.endpoint);
  if (args.api_key) cliArgs.push('--api-key', args.api_key);

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', cliArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Forward provider env vars
        ANTHROPIC_API_KEY: args.api_key ?? process.env.ANTHROPIC_API_KEY ?? '',
        OPENAI_API_KEY: args.api_key ?? process.env.OPENAI_API_KEY ?? '',
      },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          content: [
            {
              type: 'text',
              text:
                stdout +
                (stderr ? `\n---\nPer-task details:\n${stderr}` : ''),
            },
          ],
        });
      } else {
        reject(new Error(`CLI exited with code ${code}:\n${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

interface LeaderboardArgs {
  provider?: string;
  tier?: string;
  user?: string;
  lab_verified?: boolean;
  sort?: string;
  dir?: string;
  limit?: number;
}

async function getUserLeaderboard(args: LeaderboardArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider);
  if (args.tier) params.set('tier', args.tier);
  if (args.user) params.set('user', args.user);
  if (args.lab_verified) params.set('lab_verified', '1');
  if (args.sort) params.set('sort', args.sort);
  if (args.dir) params.set('dir', args.dir);
  params.set('limit', String(args.limit ?? 50));

  const res = await fetch(`${BACKEND}/v1/leaderboard/users?${params.toString()}`);
  if (!res.ok) throw new Error(`Backend ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as {
    total: number;
    entries: Array<{
      user_nickname: string;
      pipeline_score: number;
      tier: string;
      config_tag: string | null;
      model: { display_name: string; provider: string };
      created_at: string;
    }>;
  };

  const lines = [
    `Showing ${data.entries.length} of ${data.total} submissions:`,
    '',
    ...data.entries.map((e, i) => {
      const tag = e.config_tag ? ` [${e.config_tag}]` : '';
      return `  ${String(i + 1).padStart(3)}. ${e.user_nickname.padEnd(20)} ${e.model.display_name.padEnd(28)} ${e.pipeline_score.toFixed(1).padStart(6)} ${e.tier.toUpperCase().padEnd(10)} ${e.model.provider}${tag}`;
    }),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

interface ProfileArgs {
  nickname: string;
}

async function getUserProfile(args: ProfileArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.nickname) throw new Error('nickname is required');
  const res = await fetch(`${BACKEND}/v1/users/${encodeURIComponent(args.nickname)}`);
  if (res.status === 404) {
    return { content: [{ type: 'text', text: `User "${args.nickname}" not found.` }] };
  }
  if (!res.ok) throw new Error(`Backend ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as {
    nickname: string;
    submission_count: number;
    best_score: number;
    best_tier: string;
    best_model: { display_name: string; provider: string };
    avg_score: number;
    provider_counts: Record<string, number>;
    first_seen: string;
    models_tried: Array<{ model: { display_name: string }; pipeline_score: number; tier: string }>;
  };
  const lines = [
    `═══ ${data.nickname} ═══`,
    `Submissions:     ${data.submission_count}`,
    `Best:            ${data.best_score.toFixed(1)} (${data.best_tier.toUpperCase()}) on ${data.best_model.display_name}`,
    `Average:         ${data.avg_score.toFixed(1)}`,
    `First seen:      ${data.first_seen.slice(0, 10)}`,
    ``,
    `Provider mix:`,
    ...Object.entries(data.provider_counts).map(([p, c]) => `  ${p.padEnd(12)} ${c} run(s)`),
    ``,
    `Models tried (best per):`,
    ...data.models_tried.map(
      (m, i) =>
        `  ${String(i + 1).padStart(2)}. ${m.model.display_name.padEnd(28)} ${m.pipeline_score.toFixed(1).padStart(6)} ${m.tier.toUpperCase()}`,
    ),
  ];
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ---- Start ------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[pipelinescore-mcp] connected (backend: ${BACKEND})\n`);
