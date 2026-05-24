# Development

How to run PipelineScore locally + a tour of the codebase. For end-user docs, see the [README](README.md). For agent-first usage, see [AGENTS.md](AGENTS.md).

## Repo layout

```
pipelinescore/
├── benchmarks/         Taxonomy (categories, weights, tiers) + 25 v1 tasks (JSON)
├── web/                Next.js 16 frontend (port 4600 in dev)
├── backend/            Express + better-sqlite3 API (port 4601 in dev)
├── cli/                Node TypeScript CLI (`ps-bench` / `pipelinescore`)
├── mcp/                MCP server (`@pipelinescore/mcp`)
├── dist/skills/        Claude Code / Codex / Cursor skill
└── assets/hero/        Hero imagery
```

## Quick start — three terminals

### 1. Backend (Express + SQLite, port 4601)

```bash
cd backend
npm install
npm run dev
```

On first boot it auto-migrates and seeds the database (`backend/.data/pipelinescore.db`) with ~100 open-weight models and 400+ hardware-tagged sample submissions. Verify:

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

Then open http://localhost:4600. Routes:

- `/` — homepage with hero + live stat strip + top 25 model leaderboard
- `/leaderboard` — model-deduped leaderboard
- `/leaderboard/users` — full sortable/filterable user leaderboard
- `/users/[nickname]` — per-user dashboard with hardware mix + efficiency aggregates
- `/models/[slug]` — per-model stats
- `/compare/[a]/[b]` — head-to-head model comparison
- `/methodology` — score formula + anti-cheat
- `/run` — get-started instructions
- `/about` — positioning
- `/privacy` — data retention + BYOK posture

### 3. CLI (run a real benchmark against your local backend)

```bash
cd cli
npm install
# Set whichever provider key you need
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev -- run --provider anthropic --model claude-haiku-4-5-20251001 \
  --user dev-test --hardware-tag dev-mbp \
  --backend http://localhost:4601 --site http://localhost:4600
```

Or local-server, no key needed:

```bash
npm run dev -- run --provider local --endpoint http://localhost:11434 \
  --model llama-3.3-70b --user dev-test --hardware-tag m3-max-128gb \
  --backend http://localhost:4601 --site http://localhost:4600
```

## Tech stack

| Layer | Tech |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, Bricolage Grotesque + JetBrains Mono fonts via `next/font` |
| Backend | Express 5, TypeScript, better-sqlite3, Zod, HMAC for testpack signing, express-rate-limit |
| CLI | Node 22, TypeScript, Commander, Chalk, Boxen, cli-progress, official `@anthropic-ai/sdk` + `openai` SDKs |
| MCP server | `@modelcontextprotocol/sdk`, Zod, stdio transport, spawns CLI as subprocess for `run_benchmark` |
| Frontend hosting | Cloudflare Workers via `@opennextjs/cloudflare` (OpenNext adapter), served at pipelinescore.ai |
| Backend hosting | Render Web Service + 10GB persistent disk for SQLite, served at api.pipelinescore.ai |
| Judging | Deterministic Python execution for code/JSON tasks + Claude Haiku 4.5 for rubric-graded tasks |

## Typecheck / build

All four packages are TypeScript with strict mode.

```bash
# typecheck individual packages
(cd backend && npx tsc --noEmit)
(cd cli && npx tsc --noEmit)
(cd mcp && npx tsc --noEmit)
(cd web && npx tsc --noEmit)

# build the npm-publishable packages
(cd cli && npm run build)
(cd mcp && npm run build)

# build the Cloudflare Worker bundle
(cd web && npm run cf:build)
```

## Adding a new benchmark task

Edit `benchmarks/tasks-v1.json`:

```json
{
  "id": "<category>-<short-name>-<n>",
  "category": "code | reason | write | tool_use | rag | speed",
  "difficulty": 1-3,
  "prompt": "...",
  "judge_type": "exact_match | passes_tests | rubric",
  "rubric": ["criterion 1", "criterion 2"]
}
```

Bump the `version` field at the top of the JSON if you change the suite (HMAC signature is computed over the full pack).

## Adding a new model to the sample seed

Edit `backend/src/seed-local-models.ts` — push an entry into `LOCAL_MODELS` with `slug`, `display_name`, `provider`, `provider_model`, `family`, `released_at`, `context_window`, `target_score`, and `size_class`. On next backend boot, `augmentIfMissing()` adds the model + 4 sample submissions distributed across hardware tags from the size-appropriate `HARDWARE_POOL`. Existing data is never touched.

## Roadmap

**v1 (current):**
- Local-first CLI + public site + 100-model sample seed + MCP server + Claude Code skill
- Hardware-aware leaderboard groupings
- 30-day transcript retention, 90-day event log
- First 50 Beta Testers badge

**v2 (next):**
- More benchmark tasks (50+) sourced from community PRs (#2 pinned issue)
- More verified local servers (vLLM / TGI / Ramalama / etc., see pinned issue #3)
- Per-submission share-card OG image
- Trends page (model adoption over time, hardware mix shifts)
- Optional paid API tier for programmatic leaderboard access

**v3:**
- Multimodal (image, audio)
- Sponsored "lab-verified by provider" runs (clearly marked)
- Enterprise tier for testing custom internal deployments
- npm provenance attestations via GitHub Actions OIDC

## Deploy

See `Dockerfile` (backend) + `web/wrangler.jsonc` (frontend). Production goes to Render (backend) and Cloudflare Workers (frontend). DNS is managed in Cloudflare for `pipelinescore.ai` + `api.pipelinescore.ai`.

CI/CD: push to `main` triggers auto-deploy on both Render and Cloudflare Pages. No manual step beyond `git push origin main`.
