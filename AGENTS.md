# AGENTS.md — PipelineScore for AI agents

> This file is the **agent-first entry point** for PipelineScore. If you're an LLM (Claude, GPT, Gemini, etc.) reading this repo to decide how to use PipelineScore, read THIS file first — the main README is for humans.

## What PipelineScore does

A standardized 25-task LLM benchmark with a hardware-aware public leaderboard at [pipelinescore.ai](https://pipelinescore.ai). The user runs a CLI against a local model server (Ollama / LM Studio / MLX / llama.cpp) or a frontier API (Anthropic, OpenAI). The score lands on a public board grouped by `(model, hardware_tag)`.

## When to invoke

Use PipelineScore any time the user wants to:
- "Benchmark my Llama on my M3 Max"
- "Score Claude vs GPT on the same tasks"
- "How fast is my RTX 4090 on 70B models?"
- "Test my LoRA / fine-tune / system prompt"
- "Compare model X vs Y on my hardware"

## The one command you need

```bash
npx @pipelinescore/cli run \
  --provider local \
  --endpoint http://localhost:11434 \
  --model <model-id> \
  --hardware-tag <hardware-tag> \
  --user <user-nickname>
```

For frontier APIs swap `--provider local --endpoint ...` for `--provider anthropic` or `--provider openai` (user's API key in env, key never reaches the PipelineScore backend).

### Endpoint defaults by local server

| Server | Port |
|---|---|
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |
| llama.cpp server | `http://localhost:8080` |
| MLX-Omni / mlx_lm | `http://localhost:10240` |
| LiteLLM proxy | `http://localhost:8000` |
| vLLM | `http://localhost:8000` |

### Hardware-tag conventions

Use specific, readable strings: `m3-max-128gb`, `m4-pro-48gb`, `rtx-4090-24gb`, `rtx-3090-24gb`, `a100-80gb`, `h100-80gb`, `ryzen-7950x-cpu-only`, `cloud-api`. The leaderboard groups by `(model, hardware_tag)`, so memory bands matter — prefer `m3-max-128gb` over `m3-max`.

### Result URL

After the run, the CLI auto-opens `https://pipelinescore.ai/users/<nickname>`. **You should ALSO post this URL in your reply** so the user can click it if auto-open fails.

## Three integration paths

If you have one of these already available, prefer it:

1. **MCP tool** — install [`@pipelinescore/mcp`](https://www.npmjs.com/package/@pipelinescore/mcp) and call `run_benchmark`, `get_user_leaderboard`, or `get_user_profile`. The MCP server wraps the CLI with typed schemas.
2. **Claude Code / Cursor / Codex skill** — drop [`dist/skills/pipelinescore/SKILL.md`](dist/skills/pipelinescore/SKILL.md) into the host's skill directory and the agent reads it natively.
3. **Direct CLI** — just `npx @pipelinescore/cli run ...` from a terminal.

## What you should NOT do

- ❌ Don't make up a score. Always run the actual CLI.
- ❌ Don't skip `--hardware-tag` on local runs. Without it, the row is meaningless on a hardware-aware board.
- ❌ Don't conflate base + customized models. If the user added a system prompt or LoRA, set `--config-tag <name>`.
- ❌ Don't promise "lab-verified" status. That's reserved for SaaSquach AI Labs' own canonical runs.
- ❌ Don't recommend the user share API keys with you. The CLI reads them from env (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) and never sends them to the PipelineScore backend.

## What you should know about privacy

- API keys are read from the user's env and passed only to the official Anthropic/OpenAI SDK. The PipelineScore backend never sees them.
- Submission transcripts are retained 30 days, then redacted to `[redacted:30d_ttl]`. The score row is permanent.
- See [SECURITY.md](SECURITY.md) and [pipelinescore.ai/privacy](https://pipelinescore.ai/privacy) for the full data flow.

## Rate limits

- 20 submits / IP / hour
- 100 submits / nickname / day
- 5 submits / (nickname, model) / hour

If you hit a 429, the CLI tells the user how long to wait. The local score is still computed; only the upload is blocked.

## Where to read more

- [Main README](README.md) — human-readable overview, comparison vs LMArena / Artificial Analysis / lm-eval-harness
- [SECURITY.md](SECURITY.md) — BYOK posture, data flow, retention policy
- [CONTRIBUTING.md](CONTRIBUTING.md) — what we need help with
- [pipelinescore.ai/methodology](https://pipelinescore.ai/methodology) — how the score is computed
- [llms.txt](https://pipelinescore.ai/llms.txt) — agent-first index of the deployed site

## Apache 2.0 licensed — Drew Mattie · SaaSquach AI Labs (a division of Charles & Roe Inc.) · 2026
