# @pipelinescore/mcp

**MCP server for the PipelineScore LLM benchmark.** Lets any MCP-compatible AI client (Claude Code, Codex, Cursor, Continue, Cline) drive benchmarking on your local hardware + read the public leaderboard.

[![Live at pipelinescore.ai](https://img.shields.io/badge/live-pipelinescore.ai-0F766E?style=flat-square)](https://pipelinescore.ai)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@pipelinescore/mcp?style=flat-square)](https://www.npmjs.com/package/@pipelinescore/mcp)
[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol-7057ff?style=flat-square)](https://modelcontextprotocol.io)

---

## Tools

| Tool | Description |
|---|---|
| `run_benchmark` | Runs `@pipelinescore/cli` against an LLM (local or frontier API), publishes the result to the public leaderboard |
| `get_user_leaderboard` | Reads the sortable/filterable user leaderboard (filter by model, provider, hardware, tier) |
| `get_user_profile` | Reads a specific user's full dashboard (best score, models tried, hardware mix, efficiency aggregates) |

## Install

```bash
npm install -g @pipelinescore/mcp
# or run on-demand without installing
npx @pipelinescore/mcp
```

The server speaks the MCP stdio protocol — it's spawned by your AI client, not run directly.

## Wire into Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"]
    }
  }
}
```

Restart Claude Code. The three tools become available to your model.

## Wire into Cursor

Add to `.cursor/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"]
    }
  }
}
```

## Wire into Codex CLI

Add to `~/.codex/config.json`:

```json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"]
    }
  }
}
```

## Wire into other clients

Any MCP client that supports stdio servers can use it. The command is the same: `npx @pipelinescore/mcp`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PIPELINESCORE_BACKEND` | `https://api.pipelinescore.ai` | API endpoint. Override for self-hosted instances or local dev (e.g. `http://localhost:4601`). |
| `ANTHROPIC_API_KEY` | (none) | Forwarded to the CLI for `provider=anthropic` runs. Never sent to PipelineScore backend. |
| `OPENAI_API_KEY` | (none) | Forwarded to the CLI for `provider=openai` runs. Never sent to PipelineScore backend. |

## How `run_benchmark` works

Internally, the MCP server spawns `npx @pipelinescore/cli run ...` with the args forwarded. The CLI does the actual provider call + scoring + submission. The MCP server is just a thin protocol adapter.

This means:
- Local runs need **no API key** — the CLI just hits your local model server
- Frontier runs use your `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars (or `api_key` arg)
- Your key never reaches our backend (CLI calls the provider directly)

## Example AI prompt

Once installed, try saying to your AI:
> "Benchmark Llama 3.3 70B on my M3 Max against PipelineScore"

Your AI should:
1. Call `run_benchmark` with `provider=local`, `endpoint=http://localhost:11434`, `model=llama-3.3-70b`, `hardware_tag=m3-max-128gb`
2. Wait for the CLI to complete
3. Show you the score card + the public URL to your run

## Why local-first?

PipelineScore's whole pitch is **hardware-aware** ranking. Same model on M3 Max vs RTX 4090 vs A100 = three different rows. The MCP tool defaults to `--provider local` when possible — see your AI's response in [SKILL.md](https://github.com/drewmattie-code/pipelinescore/blob/main/dist/skills/pipelinescore/SKILL.md) for the default flow.

## License

[Apache 2.0](LICENSE). Drew Mattie · SaaSquach AI Labs (a division of Charles & Roe Inc.) · 2026.

## Links

- 🌐 [pipelinescore.ai](https://pipelinescore.ai) — public leaderboard
- 📦 [GitHub](https://github.com/drewmattie-code/pipelinescore) — source
- 🖥️ [CLI](https://www.npmjs.com/package/@pipelinescore/cli) — direct CLI usage
- 🛡️ [SECURITY.md](https://github.com/drewmattie-code/pipelinescore/blob/main/SECURITY.md) — BYOK posture + retention
