# PipelineScore

**The user-run LLM benchmark.** Bring your own API key, run a standardized 30-task suite against any LLM, get a deterministic score (0–100) and a tier badge. Like `cpu.userbenchmark.com`, but for language models.

Built in the daylight that no existing leaderboard occupies:

- **LMArena** = preference votes, not runs.
- **Artificial Analysis** = pro aggregator, centrally-run.
- **Academic benchmarks** (MMLU, SWE-Bench, TerminalBench) = lab-flavored, single-shot, decay fast.
- **PipelineScore** = run it yourself, on your model, with your prompt setup, against real tasks, then share the result card.

## What's here

```
pipelinescore/
├── docs/superpowers/specs/    Design spec (245-line v1)
├── benchmarks/                Taxonomy (categories, weights, tiers) + 25 v1 tasks (JSON)
├── web/                       Next.js 16 marketing site (port 4600)
├── backend/                   Express + SQLite API (port 4601)
├── cli/                       Node TypeScript CLI tool (`ps-bench`)
└── assets/hero/               Hero imagery (generated via nano-banana)
```

## Quick start

You need three terminals:

### 1. Backend (Express + SQLite, port 4601)
```bash
cd backend
npm install
npm run dev
```

On first boot it auto-migrates and seeds the database (`~/Projects/pipelinescore/backend/.data/pipelinescore.db`) with 10 reference models + 30 sample submissions. Verify:
```bash
curl http://localhost:4601/health
curl http://localhost:4601/v1/leaderboard | jq '.entries[:5]'
```

### 2. Web (Next.js 16, port 4600)
```bash
cd web
npm install
npm run dev
```

Then open http://localhost:4600. Seven routes live:
- `/` — homepage with hero
- `/leaderboard` — full ranked table
- `/models/[slug]` — per-model detail
- `/compare/[a]/[b]` — head-to-head
- `/methodology` — how the score works
- `/run` — get-started instructions
- `/about` — what + who

### 3. CLI (run a real benchmark)
```bash
cd cli
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npx tsx src/index.ts run --provider anthropic --model claude-haiku-4-5-20251001
```

The CLI fetches the day's signed test pack from `:4601/v1/testpack`, calls your chosen LLM for each task, judges responses (deterministic test cases or Claude Haiku 4.5 rubric), computes the weighted **PipelineScore**, and prints a result card:

```
╭──────────────────────────────────╮
│ PipelineScore: 86.0 — MAINLINE   │
│ Model: claude-haiku-4-5-20251001 │
│                                  │
│ Code     ██████████   96.0       │
│ Reason   ██████░░░░   60.0       │
│ Write    ██████████   98.0       │
│ Tool Use ████████░░   80.0       │
│ RAG      ██████████  100.0       │
│ Speed    █████████░   86.9       │
╰──────────────────────────────────╯
```

Other providers wired (untested but typecheck-clean):
- `--provider openai --model gpt-4o-mini` (uses `OPENAI_API_KEY`)
- `--provider local --model qwen3.6-27b --endpoint http://192.168.0.20:8080/v1`

## The score

| Category | Weight | What it tests |
|---|---|---|
| **Code** | 25% | Generation, debugging, refactoring, test writing |
| **Reason** | 20% | Multi-step reasoning, math, logic, instruction following |
| **Write** | 15% | Drafting, summarization, style adherence |
| **Tool Use** | 15% | Function-call correctness, parameter selection, schema fitting |
| **RAG** | 12% | Grounded answers, citation accuracy, no hallucination |
| **Speed** | 13% | p50 latency + tokens/sec under standardized load |

5 tasks per category. Score = Σ (category_score × weight). One headline number (0–100), category breakdown underneath.

## Tier system

| Range | Tier | |
|---|---|---|
| 90–100 | **TRUNK** | 🟢 Main industrial pipeline — top |
| 75–89 | **MAINLINE** | 🔵 Main service line — excellent |
| 60–74 | **FEEDER** | 🟠 Secondary line — solid |
| 40–59 | **TAP** | 🟧 Small branch — functional |
| 0–39 | **DRIP** | ⚪ Minimal flow — weak |

## Anti-cheat

- Public taxonomy (categories + sample prompts), private test pack (rotated daily, HMAC-signed).
- Server-side re-judgment using a held-out judge model (Claude Haiku 4.5).
- Rate limits (max 10 submissions/day per IP/user).
- Lab-verified flag on submissions re-run centrally.

## Roadmap

**v1 (current):** local-only stack. 25 tasks across 5 task categories + speed measured during execution. Apple-flavored marketing site. CLI ships against Anthropic + OpenAI + local (OpenAI-compatible).

**v2:**
- Custom-deployment comparison (compare your fine-tune or prompt-tuned setup to stock models).
- Full SEO long-tail (every model + every comparison auto-generates a page).
- OG image per submission for share-card virality.
- Cloud deployment (Cloudflare Pages for web, Render/Fly for backend).
- Dataset growth from 25 → 100+ tasks.

**v3:**
- Multimodal (image, audio).
- Sponsored leaderboard slots from model providers.
- Enterprise tier for testing custom internal deployments.

## Tech stack

- **Web**: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, SVG charts.
- **Backend**: Express, TypeScript, better-sqlite3, Zod, HMAC for testpack signing.
- **CLI**: Node 22, TypeScript, Commander, Chalk, Boxen, cli-progress.
- **Benchmark judging**: deterministic Python execution + Claude Haiku 4.5 for rubric tasks.

## License

To be determined. MIT-leaning.

## Authors

Drew Mattie (Charles & Roe), with build orchestration by Claudia.
