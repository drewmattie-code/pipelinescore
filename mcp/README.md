# @pipelinescore/mcp

MCP server for the PipelineScore LLM benchmark. Exposes three tools to any MCP-compatible client (Claude Code, Codex, Cursor, Continue, etc.).

## Tools

| Tool | What it does |
|---|---|
| `run_benchmark` | Run the PipelineScore CLI against any LLM, publish to the public leaderboard |
| `get_user_leaderboard` | Read the public user leaderboard, filterable + sortable |
| `get_user_profile` | Read one user's full dashboard |

## Install

```bash
npm install -g @pipelinescore/mcp
```

Or run via npx without installing:

```bash
npx @pipelinescore/mcp
```

## Wire into Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

Restart Claude Code. The three tools become available.

## Wire into Codex CLI

```json
// ~/.codex/config.json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"]
    }
  }
}
```

## Wire into Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"]
    }
  }
}
```

## Environment

| Var | Default | Purpose |
|---|---|---|
| `PIPELINESCORE_BACKEND` | `https://api.pipelinescore.ai` | API endpoint. Override for self-hosted instances or local dev (`http://localhost:4601`). |
| `ANTHROPIC_API_KEY` | (none) | Forwarded to the CLI for anthropic provider runs. |
| `OPENAI_API_KEY` | (none) | Forwarded to the CLI for openai provider runs. |

## How `run_benchmark` works internally

It spawns `npx @pipelinescore/cli run --provider <p> --model <m> ...` with the args forwarded. The CLI does the LLM calls + scoring + submission; the MCP server is just a thin transport.

## Why MCP?

The Claude Code skill (in `dist/skills/pipelinescore/SKILL.md`) and this MCP server cover two complementary distribution paths:

- **Skill** — pure markdown, zero runtime, the AI reads instructions and runs `npx`. Works in any AI that supports skills/rules files.
- **MCP** — programmatic interface, returns structured data. Used when the AI wants to query leaderboard data (read) or trigger benchmarks (write) without parsing CLI output.

Together they cover Claude Code, Codex, Cursor, Continue, Cline, Aider, OpenCode, OpenClaw, and anyone else who supports either pattern.
