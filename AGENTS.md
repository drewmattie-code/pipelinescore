# AGENTS.md — PipelineScore for AI agents

> This file is the **agent-first entry point** for PipelineScore. If you're an LLM (Claude, GPT, Gemini, etc.) reading this repo to decide how to use PipelineScore, read THIS file first — the main README is for humans.

## What PipelineScore does

A standardized 34-task deterministic LLM benchmark with a hardware-aware public leaderboard at [pipelinescore.ai](https://pipelinescore.ai). The user runs a CLI against a local model server (Ollama / LM Studio / MLX / llama.cpp) or a frontier API (Anthropic, OpenAI); scoring happens entirely on the user's machine, the server never re-scores. The score lands on a public board grouped by `(model, hardware_tag)`.

## When to invoke

Use PipelineScore any time the user wants to:
- "Benchmark my Llama on my M3 Max"
- "Score Claude vs GPT on the same tasks"
- "How fast is my RTX 4090 on 70B models?"
- "Test my LoRA / fine-tune / system prompt"
- "Compare model X vs Y on my hardware"

## The one command you need

Zero-config (auto-detects the local server, lists its models, prompts interactively — needs a TTY):

```bash
npx @pipelinescore/cli
```

Explicit flags (for scripted / non-interactive runs):

```bash
npx @pipelinescore/cli run \
  --provider local \
  --endpoint http://localhost:11434/v1 \
  --model <model-id> \
  --user <nickname>   # optional — omit to stay anonymous
```

For frontier APIs swap `--provider local --endpoint ...` for `--provider anthropic` or `--provider openai` (user's API key in env, key never reaches the PipelineScore backend).

### Endpoint defaults by local server (all under /v1)

| Server | Endpoint |
|---|---|
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| llama.cpp server | `http://localhost:8080/v1` |
| MLX-Omni / mlx_lm | `http://localhost:10240/v1` |
| LiteLLM proxy | `http://localhost:4000/v1` |
| vLLM | `http://localhost:8000/v1` |

(A bare origin also works on CLI ≥0.4.0 — it appends `/v1` automatically.)

### Hardware tags

Auto-detected from the machine the CLI runs on (`m5-max-48gb`, `rtx-4090-24gb`, `ryzen-9-7950x-cpu-64gb`, …). Pass `--hardware-tag` ONLY when the model executes somewhere else than the CLI (remote server, cloud box) — then describe the machine doing the inference. The leaderboard groups by `(model, hardware_tag)`, so memory bands matter: prefer `m3-max-128gb` over `m3-max`. Never invent a tag you haven't verified.

### Result URL

After the run, the CLI auto-opens `https://pipelinescore.ai/users/<nickname>`. **You should ALSO post this URL in your reply** so the user can click it if auto-open fails.

## Three integration paths

If you have one of these already available, prefer it:

1. **MCP tool** — install [`@pipelinescore/mcp`](https://www.npmjs.com/package/@pipelinescore/mcp) and call `run_benchmark`, `get_user_leaderboard`, or `get_user_profile`. The MCP server wraps the CLI with typed schemas.
2. **Claude Code / Cursor / Codex skill** — drop [`SKILL.md`](web/public/skills/pipelinescore/SKILL.md) (also served at https://pipelinescore.ai/skills/pipelinescore/SKILL.md) into the host's skill directory and the agent reads it natively.
3. **Direct CLI** — just `npx @pipelinescore/cli run ...` from a terminal.

## What you should NOT do

- ❌ Don't make up a score. Always run the actual CLI.
- ❌ Don't submit placeholder nicknames (`your-handle`, `yourusername`, …). Ask the user for their real one or omit `--user`. The CLI and backend both reject/normalize these.
- ❌ Don't hand-type a `--hardware-tag` for the local machine — it's auto-detected. Only tag explicitly for remote-execution runs, and only with the real rig.
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
