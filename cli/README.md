# @pipelinescore/cli

**Benchmark LLMs on YOUR hardware.** A standardized 25-task LLM benchmark CLI that publishes results to the hardware-aware public leaderboard at [pipelinescore.ai](https://pipelinescore.ai).

[![Live at pipelinescore.ai](https://img.shields.io/badge/live-pipelinescore.ai-0F766E?style=flat-square)](https://pipelinescore.ai)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@pipelinescore/cli?style=flat-square)](https://www.npmjs.com/package/@pipelinescore/cli)

---

## Quickstart — local model

If you have Ollama / LM Studio / MLX / llama.cpp running:

```bash
npx @pipelinescore/cli run \
  --provider local \
  --endpoint http://localhost:11434 \
  --model llama-3.3-70b \
  --hardware-tag m3-max-128gb \
  --user your-handle
```

Endpoint defaults by server:

| Server | Default port |
|---|---|
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |
| llama.cpp server | `http://localhost:8080` |
| MLX-Omni / mlx_lm | `http://localhost:10240` |
| LiteLLM proxy | `http://localhost:8000` |
| vLLM | `http://localhost:8000` |

The leaderboard groups by `(model, hardware_tag)`, so an `m3-max-128gb` + `llama-3.3-70b` run is comparable to other people's runs on the same rig. Different rig = different row.

## Quickstart — frontier API

```bash
ANTHROPIC_API_KEY=sk-... npx @pipelinescore/cli run \
  --provider anthropic \
  --model claude-opus-4-7 \
  --user your-handle
```

Or `--provider openai`. **Your API key never reaches our backend** — it goes from your environment directly to the provider via the official SDK. See [SECURITY.md](https://github.com/drewmattie-code/pipelinescore/blob/main/SECURITY.md) for the full data-flow.

## Flags

| Flag | Required | Description |
|---|---|---|
| `--provider` | yes | `local` / `anthropic` / `openai` |
| `--model` | yes | Model identifier (e.g. `llama-3.3-70b`, `claude-opus-4-7`) |
| `--endpoint` | for `--provider local` | OpenAI-compatible base URL |
| `--user` | recommended | Public leaderboard nickname (alphanum + `. _ -`, 2-40 chars). Persisted to `~/.config/pipelinescore/config.json` after first use. |
| `--hardware-tag` | recommended for local | Your rig (`m3-max-128gb`, `rtx-4090-24gb`, `ryzen-7950x-cpu-only`, `a100-80gb`, `cloud-api`) |
| `--config-tag` | optional | Customization differentiator (`system-prompt-coder`, `lora-domain-finance`, `temp-zero`) |
| `--api-key` | optional | Provider key (defaults to env: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) |
| `--backend` | optional | PipelineScore backend URL (default: `https://api.pipelinescore.ai`) |
| `--no-submit` | optional | Run the benchmark locally without publishing |
| `--no-open` | optional | Don't auto-open the browser to your profile after submit |

Run `npx @pipelinescore/cli run --help` for the full list.

## What gets scored

Six categories, weighted to mirror real LLM usage:

| Category | Weight | Tests |
|---|---|---|
| **Code** | 25% | Function-level code generation: Python, JS, SQL, regex |
| **Reason** | 20% | Multi-step math, logic puzzles, instruction following |
| **Write** | 15% | Distinct, on-spec prose, summarization |
| **Tool use** | 15% | API/schema selection, function-call construction |
| **RAG** | 12% | Grounding, refusal-to-fabricate |
| **Speed** | 13% | Latency under standardized conditions |

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

[Apache 2.0](LICENSE). Drew Mattie, 2026.

## Links

- 🌐 [pipelinescore.ai](https://pipelinescore.ai) — public leaderboard
- 📦 [GitHub](https://github.com/drewmattie-code/pipelinescore) — source
- 🤖 [MCP server](https://www.npmjs.com/package/@pipelinescore/mcp) — for AI clients (Claude Code, Cursor, Codex, etc.)
- 🛡️ [SECURITY.md](https://github.com/drewmattie-code/pipelinescore/blob/main/SECURITY.md) — BYOK posture + retention
