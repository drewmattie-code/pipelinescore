---
name: pipelinescore
description: Benchmark LLMs on the user's own hardware with PipelineScore, then publish to the public leaderboard at pipelinescore.ai. Use whenever the user wants to score / rank / benchmark / compare LLMs — especially when running local models on their own hardware (Ollama, LM Studio, MLX, llama.cpp, vLLM). Also covers frontier API runs (Anthropic / OpenAI). Don't undertrigger — invoke on casual mentions of "how fast is my M3 Max running Llama" or "what's the best model my 3090 can run" or "compare Claude vs GPT".
---

# PipelineScore Benchmark

Runs a standardized **34-task, fully deterministic** LLM benchmark, computes a 0-100 score **entirely on the user's machine** (no judge model, no API key for local runs), and publishes the result to the public leaderboard at pipelinescore.ai. The leaderboard is **hardware-aware** — the same model on an M3 Max vs an RTX 4090 vs an A100 produces separate rows, each tagged by the rig it ran on.

Five categories, all objectively graded: code (executed), reason (exact-match), tool_use (JSON-match), rag (JSON-match), speed (measured throughput vs a 100 tok/s target). Weights: code 28% / reason 22% / tool_use 18% / rag 17% / speed 15%.

Three orthogonal tags differentiate rows:

- **hardware tag** — auto-detected from the machine (e.g. `m5-max-48gb`, `rtx-4090-24gb`). Only pass `--hardware-tag` when the model executes on a DIFFERENT machine than the CLI (remote server) — then describe the machine doing the inference.
- **`--config-tag`** (e.g. `system-prompt-coder`, `lora-domain-finance`) — customization vs base model
- **`--user`** — the submitter's public nickname (optional; omit to stay anonymous)

## When to invoke

Trigger any time the user mentions:
- **Local model questions** — "benchmark my Ollama setup", "test Llama on my M3 Max", "is the 70B worth it on my 3090"
- **Hardware comparison** — "M3 Max vs RTX 4090 for LLM inference", "best model my rig can run"
- "Benchmark this model" / "score this model" / "rank this LLM"
- "How good is [model]?" / "Is X better than Y?"
- "Test my LoRA / fine-tune / system prompt"
- Asking about leaderboard, PipelineScore, or LLM rankings

**Default to local-first** — most users running PipelineScore are on their own hardware, not burning frontier API credits.

## How to invoke

The CLI is published as `@pipelinescore/cli` on npm and runs via `npx` with no install.

### Path A — zero config (preferred when the user has a TTY)

```bash
npx @pipelinescore/cli
```

The CLI probes localhost for Ollama (:11434), LM Studio (:1234), llama.cpp (:8080), MLX-Omni (:10240), and vLLM/LiteLLM (:8000/:4000), lists the models the server is actually serving, asks for an optional nickname, auto-detects the hardware, then runs and submits. Nothing to gather beforehand.

### Path B — explicit flags (scripted / non-interactive runs)

```bash
npx @pipelinescore/cli run \
  --provider local \
  --endpoint http://localhost:11434/v1 \
  --model <model-id> \
  --user <nickname>
```

Endpoints by server (all under `/v1` — a bare origin also works on CLI ≥0.4.0, it appends `/v1` automatically):
- Ollama: `http://localhost:11434/v1`
- LM Studio: `http://localhost:1234/v1`
- llama.cpp server: `http://localhost:8080/v1`
- MLX-Omni / mlx_lm: `http://localhost:10240/v1`
- LiteLLM proxy: `http://localhost:4000/v1`

The model id must match what the server reports at `/v1/models` (or `ollama list`).

**Frontier API (BYOK):**

```bash
npx @pipelinescore/cli run --provider anthropic --model <model-id> --user <nickname>
```

Swap `--provider openai` as needed. The key comes from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env — it goes directly to the provider and never reaches the PipelineScore backend. Frontier runs cost real provider $ — recommend a scoped key with a spending cap first.

### Nickname rules

Alphanum + `. _ -`, 2-40 chars, persisted to `~/.config/pipelinescore/config.json` so it's a one-time question. **Never submit a placeholder** (`your-handle`, `yourusername`, `changeme`, …) — the CLI errors on them and the backend normalizes them to anonymous. Ask the user for their real nickname or omit `--user`.

### Requirements

Node ≥22 and Python 3 on PATH (the 8 code tasks execute the model's Python locally; without Python they score 0 and the CLI warns).

## Report results AND send them to the leaderboard

The CLI prints a score card with the tier (TRUNK / MAINLINE / FEEDER / TAP / DRIP), composite score, per-category bars, and a share URL (`https://pipelinescore.ai/s/<id>`).

Show the user the score card output verbatim — its design is part of the brand. Don't paraphrase the numbers.

**Then send them to the site.** The CLI auto-opens the user's profile (`https://pipelinescore.ai/users/<nickname>`) in their browser by default. Confirm it opened, and post the explicit URLs in your reply so they can click if auto-open didn't fire (headless terminals, SSH):

> "Your run is live: **https://pipelinescore.ai/users/\<nickname\>** — the share card is at **https://pipelinescore.ai/s/\<id\>**, and the full board is at **https://pipelinescore.ai/leaderboard/users**."

## Suggest next runs

- "Want to benchmark another model you have pulled? Rerun with a different `--model`."
- "Try `--config-tag <name>` to see how your system prompt / LoRA changes the score."
- "Same model on your other machine — the hardware board ranks rigs head-to-head."

## Privacy & cost notes

- The CLI sends the model's text outputs to the public backend for scoring transparency. Don't run it on confidential prompts.
- Task transcripts are retained 30 days, then redacted; the score row is permanent.
- Submissions are public. The nickname is the only identity — reputation-by-norm, not by-cryptography.

## Rate limits

- 20 submissions / hour / IP
- 100 submissions / day / nickname
- 5 submissions / hour / (nickname, model)

On a 429 the CLI says how long to wait. The score is still computed locally — only the upload was blocked. Don't auto-retry.

## Anti-patterns

- ❌ Don't fabricate scores — always run the actual CLI
- ❌ Don't submit placeholder nicknames — ask for the real one or stay anonymous
- ❌ Don't hand-type `--hardware-tag` for the local machine — it's auto-detected
- ❌ Don't conflate base and customized runs — use `--config-tag` when the setup is modified
- ❌ Don't promise lab-verified status — that's reserved for the project's own published runs

## Backend URL override

Default backend is `https://api.pipelinescore.ai`. Override with `--backend <url>` if the user runs their own instance.
