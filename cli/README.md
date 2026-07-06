# @pipelinescore/cli

**Benchmark LLMs on YOUR hardware.** A standardized 34-task, fully deterministic LLM benchmark CLI — no judge model, no API key for local runs — that publishes results to the hardware-aware public leaderboard at [pipelinescore.ai](https://pipelinescore.ai).

[![Live at pipelinescore.ai](https://img.shields.io/badge/live-pipelinescore.ai-0F766E?style=flat-square)](https://pipelinescore.ai)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@pipelinescore/cli?style=flat-square)](https://www.npmjs.com/package/@pipelinescore/cli)

---

## Quickstart — zero config

```bash
npx @pipelinescore/cli
```

The CLI finds your local server (Ollama, LM Studio, llama.cpp, MLX-Omni, vLLM/LiteLLM), lists the models it's serving, asks for an optional leaderboard nickname, auto-detects your hardware, then runs and submits.

## Quickstart — explicit flags

```bash
npx @pipelinescore/cli run \
  --provider local \
  --endpoint http://localhost:11434/v1 \
  --model llama3.2 \
  --user yourname   # optional — omit to stay anonymous
```

Endpoints by server (all under `/v1`; a bare origin also works — the CLI appends `/v1`):

| Server | Endpoint |
|---|---|
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| llama.cpp server | `http://localhost:8080/v1` |
| MLX-Omni / mlx_lm | `http://localhost:10240/v1` |
| LiteLLM proxy | `http://localhost:4000/v1` |
| vLLM | `http://localhost:8000/v1` |

Your hardware tag is **auto-detected** (`m5-max-48gb`, `rtx-4090-24gb`, …). The leaderboard groups by `(model, hardware_tag)`, so your run is comparable to other people's runs of the same model on the same rig — different rig, different row.

## Quickstart — frontier API

```bash
ANTHROPIC_API_KEY=sk-... npx @pipelinescore/cli run \
  --provider anthropic \
  --model claude-opus-4-7
```

Or `--provider openai`. **Your API key never reaches our backend** — it goes from your environment directly to the provider via the official SDK. See [SECURITY.md](https://github.com/drewmattie-code/pipelinescore/blob/main/SECURITY.md) for the full data-flow.

## Flags

| Flag | Required | Description |
|---|---|---|
| `--provider` | yes | `local` / `anthropic` / `openai` |
| `--model` | yes | Model identifier (e.g. `llama-3.3-70b`, `claude-opus-4-7`) |
| `--endpoint` | for `--provider local` | OpenAI-compatible base URL |
| `--user` | recommended | Public leaderboard nickname (alphanum + `. _ -`, 2-40 chars; placeholders like `your-handle` are rejected). Persisted to `~/.config/pipelinescore/config.json` after first use. |
| `--hardware-tag` | rarely needed | Auto-detected on local runs. Pass it only when the model executes on a different machine than the CLI (`m3-ultra-256gb`, `rtx-4090-24gb`, `cloud-api`) |
| `--config-tag` | optional | Customization differentiator (`system-prompt-coder`, `lora-domain-finance`, `temp-zero`) |
| `--api-key` | optional | Provider key (defaults to env: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) |
| `--backend` | optional | PipelineScore backend URL (default: `https://api.pipelinescore.ai`) |
| `--no-submit` | optional | Run the benchmark locally without publishing |
| `--no-open` | optional | Don't auto-open the browser to your profile after submit |

Run `npx @pipelinescore/cli run --help` for the full list.

## What gets scored

Five categories, fully deterministic — graded on your machine, no judge model:

| Category | Weight | Tests |
|---|---|---|
| **Code** | 28% | Function-level code generation, graded by executing the output (needs Python 3 on PATH) |
| **Reason** | 22% | Multi-step math, logic puzzles, instruction following — exact-match |
| **Tool use** | 18% | API/schema selection, function-call construction — JSON-match |
| **RAG** | 17% | Grounding, refusal-to-fabricate — JSON-match |
| **Speed** | 15% | Measured throughput (tokens/sec) vs a 100 tok/s target |

Score is a weighted average (0-100) mapped to one of five tiers:

- **TRUNK** (90-100) — top of the heap
- **MAINLINE** (75-89) — excellent and reliable
- **FEEDER** (60-74) — solid, capable
- **TAP** (40-59) — functional small-branch
- **DRIP** (0-39) — minimal flow

## Privacy

- Your API key never reaches our backend
- Submission body (transcripts) retained 30 days, then redacted
- Submission rows (score, tier, model, hardware tag, nickname) retained permanently — that's the leaderboard

Full details: [pipelinescore.ai/privacy](https://pipelinescore.ai/privacy)

## License

[Apache 2.0](LICENSE). Drew Mattie · SaaSquach AI Labs (a division of Charles & Roe Inc.) · 2026.

## Links

- 🌐 [pipelinescore.ai](https://pipelinescore.ai) — public leaderboard
- 📦 [GitHub](https://github.com/drewmattie-code/pipelinescore) — source
- 🤖 [MCP server](https://www.npmjs.com/package/@pipelinescore/mcp) — for AI clients (Claude Code, Cursor, Codex, etc.)
- 🛡️ [SECURITY.md](https://github.com/drewmattie-code/pipelinescore/blob/main/SECURITY.md) — BYOK posture + retention
