<div align="center">

# PipelineScore

**Benchmark LLMs on YOUR hardware.** Same 25 standardized tasks, deterministic 0–100 score, your environment. The only public LLM leaderboard that ranks where the model runs — not just which model it is.

[![Live at pipelinescore.ai](https://img.shields.io/badge/live-pipelinescore.ai-0F766E?style=flat-square)](https://pipelinescore.ai)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![Made with TypeScript](https://img.shields.io/badge/made_with-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/drewmattie-code/pipelinescore?style=flat-square)](https://github.com/drewmattie-code/pipelinescore/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/drewmattie-code/pipelinescore?style=flat-square)](https://github.com/drewmattie-code/pipelinescore/issues)
[![Local-first](https://img.shields.io/badge/local--first-Ollama_·_LM_Studio_·_MLX_·_llama.cpp-0F766E?style=flat-square)](https://pipelinescore.ai/run)

[**🚀 Live at pipelinescore.ai**](https://pipelinescore.ai)

[Live leaderboard](https://pipelinescore.ai/leaderboard/users) · [Methodology](https://pipelinescore.ai/methodology) · [Privacy / BYOK posture](https://pipelinescore.ai/privacy) · [Run the CLI](https://pipelinescore.ai/run)

[![PipelineScore live leaderboard — DeepSeek R1 / Qwen 3 / Llama 3.3 across A100, H100, M2 Ultra, B200 hardware tags](assets/leaderboard-screenshot.jpg)](https://pipelinescore.ai/leaderboard/users)

</div>

---

## What it looks like

```text
$ npx @pipelinescore/cli run \
    --provider local --endpoint http://localhost:11434 \
    --model llama-3.3-70b --hardware-tag m3-max-128gb \
    --user your-handle

╭ PipelineScore v0.1.0 ──────────────────╮
│ Provider:     local                    │
│ Model:        llama-3.3-70b            │
│ Hardware:     m3-max-128gb             │
│ Config tag:   — (base model)           │
│ User:         your-handle              │
│ Submit:       yes                      │
╰────────────────────────────────────────╯

Fetched testpack 2026-05-24-v1 from backend.
Running 25 tasks ... ████████████████████ 25/25

╭──────────────────── PipelineScore ─────────────────────╮
│                                                        │
│   78.4   MAINLINE                                      │
│   ────                                                 │
│                                                        │
│   code ████████░░  79.1     tool_use ██████░░░░  61.4  │
│   reason ███████░░ 75.8     rag      ████████░░  82.6  │
│   write ████████░░ 81.2     speed    █████░░░░░  52.3  │
│                                                        │
│   Total tokens: 4,827 · Avg latency: 712ms             │
│   See your run: pipelinescore.ai/users/your-handle     │
╰────────────────────────────────────────────────────────╯

Opening your leaderboard page in your browser.
```

## Quickstart — local model (30 seconds)

If you have Ollama / LM Studio / MLX / llama.cpp running:

```bash
npx @pipelinescore/cli run \
  --provider local \
  --endpoint http://localhost:11434 \
  --model llama-3.3-70b \
  --hardware-tag m3-max-128gb \
  --user your-handle
```

Swap port for LM Studio (`1234`), llama.cpp (`8080`), MLX-Omni (`10240`), or LiteLLM proxy (`8000`). Replace `m3-max-128gb` with your rig (`rtx-4090-24gb`, `ryzen-7950x-cpu-only`, `a100-80gb`, anything alphanum + `. _ -`).

The CLI runs locally, calls your model server, scores the output, and publishes the result to https://pipelinescore.ai/users/your-handle.

## Quickstart — frontier API (BYOK)

```bash
ANTHROPIC_API_KEY=sk-... npx @pipelinescore/cli run \
  --provider anthropic --model claude-opus-4-7 \
  --user your-handle
```

Or `--provider openai`. **Your key never reaches our backend** — it goes directly to the provider. See [Privacy](https://pipelinescore.ai/privacy) for the full data-flow.

## Why this leaderboard exists

Every other ranked LLM list ignores the rig:

| | Hardware-aware? | You can run it yourself? | Local-model coverage | Reproducible | Open source |
|---|:---:|:---:|:---:|:---:|:---:|
| **PipelineScore** | ✅ | ✅ | ✅ | ✅ | ✅ Apache 2.0 |
| LMArena | ❌ | ❌ (preference votes only) | partial | ❌ | partial |
| Artificial Analysis | ❌ | ❌ (centrally run) | partial | ❌ | ❌ |
| lm-evaluation-harness | ❌ | ✅ | ✅ | ✅ | ✅ MIT |
| MMLU / SWE-Bench / TerminalBench | ❌ | ✅ | ✅ | ⚠️ test set leaks fast | ✅ |
| OpenLLM Leaderboard (HF) | ❌ | ❌ | ✅ | ✅ | ✅ |

**The missing axis is the hardware tag.** Same Llama 4 on an M3 Max vs an RTX 4090 vs an A100 produces three very different real-world experiences. Same RTX 4090 with three different models produces three apples-to-apples comparisons. The benchmark is reproducible, the hardware tag is preserved, the score lands on a public, searchable leaderboard at https://pipelinescore.ai/leaderboard/users.

## Architecture

```mermaid
flowchart LR
    A[Your CLI<br/>npx @pipelinescore/cli] -->|HTTPS<br/>OpenAI-compat| B[Your model server<br/>Ollama / LM Studio /<br/>MLX / llama.cpp / vLLM]
    A -->|HTTPS POST<br/>score + transcripts| C[api.pipelinescore.ai<br/>Express + SQLite<br/>on Render]
    C -->|read| D[Cloudflare Worker<br/>Next.js via OpenNext]
    D -->|HTTPS GET| E[pipelinescore.ai<br/>public leaderboard]

    F[Claude Code skill] -->|invokes| A
    G[pipelinescore-mcp<br/>MCP server] -->|invokes| A
    G -->|reads| C

    style A fill:#0F766E,color:#fff
    style E fill:#0F766E,color:#fff
```

**Three integration paths** to drive the CLI:
1. **Manual** — copy/paste the `npx` command into your terminal
2. **Skill** — drop [`SKILL.md`](dist/skills/pipelinescore/SKILL.md) into `~/.claude/skills/` and your AI runs it for you
3. **MCP** — install [`@pipelinescore/mcp`](mcp/) and any MCP-compatible client (Claude Code, Cursor, Codex, Continue, Cline) gets the benchmark as a tool

**Backend never sees your API key.** When `--provider anthropic/openai`, the CLI calls the provider directly. Only the score + transcripts (with API keys stripped) reach our backend. See [SECURITY.md](SECURITY.md) for the full posture.

## The score

Six categories, weighted to mirror real LLM usage. One headline number (0–100), category breakdown underneath. Score maps to one of five tiers — TRUNK / MAINLINE / FEEDER / TAP / DRIP — for at-a-glance readability.

Full methodology + weights + anti-cheat: [pipelinescore.ai/methodology](https://pipelinescore.ai/methodology)

## Deeper documentation

This README is the front door. For specifics:

| | Where |
|---|---|
| 🤖 LLM-first usage guide | [AGENTS.md](AGENTS.md) |
| 🛠️ Local dev setup (backend + web + CLI) | [DEVELOPMENT.md](DEVELOPMENT.md) |
| 🛡️ BYOK posture + retention policy | [SECURITY.md](SECURITY.md) + [pipelinescore.ai/privacy](https://pipelinescore.ai/privacy) |
| 🧮 How scores are computed + anti-cheat | [pipelinescore.ai/methodology](https://pipelinescore.ai/methodology) |
| 🤝 Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 📜 Changelog | [CHANGELOG.md](CHANGELOG.md) |
| 🗣️ Code of conduct | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |

## Contributing

We need help with:
- **More benchmark tasks** — submit a PR with a task in `benchmarks/tasks-v1.json`
- **More local server endpoints** — vLLM, TGI, Ramalama, anything OpenAI-compatible
- **Hardware tag suggestions** — common rigs we're missing in [seed-local-models.ts](backend/src/seed-local-models.ts)
- **Bug reports** — file an issue with the failing nickname / model / hardware combo

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow + [SECURITY.md](SECURITY.md) for the BYOK posture.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=drewmattie-code/pipelinescore&type=Date)](https://star-history.com/#drewmattie-code/pipelinescore&Date)

If this repo is useful to you, a star is the easiest signal to send. It helps surface PipelineScore to other devs running local models.

## License

[Apache 2.0](LICENSE).

## Authors

Drew Mattie (Charles & Roe Inc.)
