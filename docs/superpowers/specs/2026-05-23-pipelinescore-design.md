# PipelineScore — Design Spec
*Date: 2026-05-23 · Author: Claudia (for Drew Mattie) · Status: v1*

## 1. Goal

Build a **consumer-grade, user-run LLM benchmark** in the spirit of `cpu.userbenchmark.com`. Users download a CLI tool, run a standardized test suite against any LLM (their own API key), get a deterministic **PipelineScore** (0–100), receive a tier badge, and (optionally) post results to a public leaderboard at `pipelinescore.ai`.

No existing leaderboard does this:
- **LMArena** = preference votes, not runs.
- **Artificial Analysis** = pro aggregator, centrally-run.
- **MMLU / SWE-Bench / TerminalBench** = lab benchmarks, single-shot, decay fast.

PipelineScore = "**run this on your own setup, get a real score, share the card, find out where you actually rank.**"

## 2. Non-Goals (v1)

- Multimodal (images / audio) — text-only for v1.
- Real-time human judging — automated only.
- Fine-tuning evaluation in v1 (custom-deployment comparison is v2).
- Mobile app — web + CLI only.
- Multi-language UI — English-only.

## 3. Decisions (locked by Drew 2026-05-23)

| # | Decision | Choice |
|---|---|---|
| 1 | Test runner | (a) User CLI tool with their own API key |
| 2 | Surface | (a) All-purpose LLM (agent pipelines = one category) |
| 3 | Branding | (a) Serious tier names, **creatively flavored** |

## 4. Architecture

```
┌──────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  CLI Tool        │    │  Backend API         │    │  Web Frontend    │
│  (Node + TS)     │──→ │  (Express + TS)      │←── │  (Next.js + TS)  │
│  npx ps-bench    │    │  Postgres + Redis    │    │  pipelinescore.ai│
└──────────────────┘    └──────────────────────┘    └──────────────────┘
        │                        │                          │
        │ (1) fetch test pack    │ (4) leaderboard query    │
        │ (2) call user's LLM    │ (5) model detail page    │
        │ (3) submit results     │ (6) comparison page      │
        ▼                        ▼                          ▼
   User's LLM API          Postgres tables:            SEO long-tail
   (Anthropic, OpenAI,     submissions / models /      pages: every
   Google, Mistral,        tests / test_versions /     model + every
   Cohere, custom)         judgments / users           comparison pair
```

### 4.1 CLI Tool (`@pipelinescore/cli`)

- Node + TypeScript, distributed via npm: `npx @pipelinescore/cli run --model claude-opus-4-7 --provider anthropic`.
- Supports stock providers (Anthropic, OpenAI, Google, Mistral, Cohere, Ollama, custom OpenAI-compatible endpoint).
- Pulls **today's signed test pack** from `https://api.pipelinescore.ai/v1/testpack` (rotating private test set drawn from a public taxonomy).
- Runs each task against the user's chosen LLM.
- Submits results + raw transcripts to the backend for server-side re-judgment.
- Shows the result card in the terminal + URL to the public submission page.

### 4.2 Backend API (`@pipelinescore/api`)

- Express + TypeScript, Postgres for persistent state, Redis for rate limiting and test-pack signing.
- Endpoints:
  - `GET  /v1/testpack` — signed test pack (rotated daily, draws 30 tasks from a 200-task taxonomy)
  - `POST /v1/submissions` — receive raw transcripts, re-judge server-side, score, store
  - `GET  /v1/leaderboard` — top models by composite + category
  - `GET  /v1/models/:id` — per-model detail (median scores, trend over time, sample tasks)
  - `GET  /v1/compare/:a/:b` — head-to-head comparison
  - `GET  /v1/submissions/:id` — single submission detail (shareable URL)
- **Anti-cheat:** server-side re-judgment using held-out judge model (Claude Haiku 4.5). Hidden test set rotates daily. Same test pack signed per-day so two submissions on the same day are comparable.

### 4.3 Web Frontend (`pipelinescore.ai`)

- Next.js 16 + TypeScript + Tailwind + framer-motion + shadcn/ui.
- Pages:
  - `/` — landing + headline leaderboard
  - `/leaderboard` — full ranked list, filterable by category
  - `/models/[id]` — per-model detail (every model gets a page — SEO long-tail)
  - `/compare/[a]/[b]` — head-to-head ("Claude 4.7 vs GPT-5.5" — SEO long-tail)
  - `/submissions/[id]` — single submission card (shareable, OpenGraph image)
  - `/methodology` — how the score works
  - `/run` — get started: "npx @pipelinescore/cli run"
  - `/about`
- **Hero image** generated via `nano-banana-2` skill — pipeline-themed, industrial-clean aesthetic.
- **Shareable card per submission** — OpenGraph image dynamically generated showing model + score + tier badge.

## 5. The Score

### 5.1 Categories (6)

| Category | Weight | What it tests |
|---|---|---|
| **Code** | 25% | Code generation, debugging, refactoring, test writing — runnable, gradeable code |
| **Reason** | 20% | Multi-step reasoning, math, logic, instruction following |
| **Write** | 15% | Drafting, summarization, style adherence, tone control |
| **Tool Use** | 15% | Function calling correctness, parameter selection, multi-step orchestration |
| **RAG** | 12% | Grounded answering, citation accuracy, faithfulness, no hallucination |
| **Speed** | 13% | Latency (p50, p95) and tokens/sec under standardized load |

Weights chosen to reflect real-world LLM usage distribution (rough survey from 2026 Anthropic / OpenAI usage reports + Stack Overflow developer survey signal). Adjustable in `benchmarks/weights.json`.

### 5.2 PipelineScore Formula

```
PipelineScore = Σ (category_score × weight)

category_score = normalized 0-100 vs. anchored baseline (Claude Opus 4.7 = 100 reference at launch)
weights sum to 1.0
```

Per-task scoring:
- **Deterministic tests** (code execution, exact-match, schema validation): pass/fail × difficulty multiplier.
- **Subjective tests** (writing quality, summarization): judge model (Claude Haiku 4.5) scores 0-10 against rubric.
- **Speed**: measured by harness, normalized against reference.

### 5.3 Tier System (5 tiers, pipeline-domain creative names)

| Tier | Score range | Name | Vibe |
|---|---|---|---|
| 5 | 90–100 | **TRUNK** | Main industrial pipeline — top of the heap |
| 4 | 75–89 | **MAINLINE** | Main service line — excellent, reliable |
| 3 | 60–74 | **FEEDER** | Secondary line — solid, capable |
| 2 | 40–59 | **TAP** | Small branch connection — functional |
| 1 | 0–39 | **DRIP** | Minimal flow — weak |

(Alternates considered + documented: TURBINE/PISTON/ENGINE/GEAR/BOLT and ROCKET/JET/TURBOPROP/PROP/GLIDER. Drew can swap. Pipeline-domain wins on brand fit.)

## 6. Visual Identity

- **Palette:** Apple-style cool neutrals (white #FBFBFD, ink #1D1D1F, line #D2D2D7) + industrial accent (deep emerald `#0F766E` — matches saasquach.ai). Restraint over neon.
- **Typography:** Inter / SF Pro Display headlines + JetBrains Mono for benchmark numbers.
- **Hero image** generated via `nano-banana-2`: industrial pipeline running through a clean white space, glow of data flowing through it, abstract enough to feel like benchmarking but concrete enough to feel like *infrastructure*. Generated at Phase 1, used on landing page hero + OG card backgrounds.
- **Tier badges**: SVG, designed in-component, color-coded (Trunk = emerald, Mainline = blue, Feeder = amber, Tap = orange, Drip = grey).

## 7. Anti-Cheat & Test Integrity

- **Public test taxonomy** (categories, task types, sample prompts) so users know what's tested.
- **Private test pack** (actual prompts) rotated daily, signed per-day, cryptographically bound to the submission.
- **Server-side re-judgment** of every submission using held-out judge model (Claude Haiku 4.5).
- **Rate limits** (max 10 submissions/day per IP/user) to prevent score-mining.
- **Lab-verified flag** on submissions PipelineScore re-runs centrally — those become the canonical record.
- **Submission lifetime**: 30 days for user-submitted, permanent for lab-verified.

## 8. SEO Long-Tail Moat

Every model gets `/models/<slug>`. Every comparison pair gets `/compare/<a>/<b>`. Both are statically generated, indexed, share-able. Content fills in from leaderboard data.

This is where the search-traffic moat lives: "Claude 4.7 vs GPT-5.5 code benchmark" → owns the page.

## 9. Database Schema (Postgres)

```sql
-- Models we know about
CREATE TABLE models (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            text UNIQUE NOT NULL,           -- "claude-opus-4-7"
  display_name    text NOT NULL,                  -- "Claude Opus 4.7"
  provider        text NOT NULL,                  -- "anthropic"
  provider_model  text NOT NULL,                  -- "claude-opus-4-20250514"
  family          text,                           -- "claude"
  released_at     date,
  context_window  int,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

-- Each submission = one user's run of one test pack against one model
CREATE TABLE submissions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id         uuid NOT NULL REFERENCES models(id),
  testpack_version text NOT NULL,                 -- "2026-05-23"
  pipeline_score   numeric(5,2) NOT NULL,         -- 0.00-100.00
  tier             text NOT NULL,                 -- "trunk" | "mainline" | etc
  category_scores  jsonb NOT NULL,                -- {code: 87.5, reason: 91.2, ...}
  raw_transcripts  jsonb NOT NULL,                -- per-task input/output (for re-judge audit)
  cli_version      text NOT NULL,
  submitter_ip     text,                          -- hashed
  user_id          uuid,                          -- nullable (anonymous OK)
  lab_verified     boolean DEFAULT false,
  notes            text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_submissions_model       ON submissions(model_id, created_at DESC);
CREATE INDEX idx_submissions_score       ON submissions(pipeline_score DESC);
CREATE INDEX idx_submissions_verified    ON submissions(lab_verified, pipeline_score DESC);

-- Per-task results (joined for analytics + re-judgment audit)
CREATE TABLE task_results (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id   uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  task_id         text NOT NULL,                  -- "code-fib-1"
  category        text NOT NULL,                  -- "code"
  task_input      text NOT NULL,
  model_output    text NOT NULL,
  judge_score     numeric(4,2),                   -- 0-10
  passed          boolean,
  latency_ms      int,
  tokens_used     int,
  judge_rationale text
);

-- User accounts (optional — anonymous submissions allowed)
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text UNIQUE,
  api_key_hash  text,                             -- for CLI auth (sha256)
  display_name  text,
  created_at    timestamptz DEFAULT now()
);
```

## 10. Implementation Phases

The plan that follows in `writing-plans` decomposes this into ordered tasks:

| Phase | Deliverable | Skill emphasized |
|---|---|---|
| 1 | Project scaffold + spec + hero image | `superpowers:brainstorming`, `superpowers:writing-plans`, `nano-banana-2` |
| 2 | Marketing site (Next.js, 6 pages, mock data) | `frontend-design`, `saasquach-scqa`, `shadcn-tailwind`, `brand-guidelines` |
| 3 | Backend API + Postgres schema | `superpowers:test-driven-development`, `claude-api` |
| 4 | CLI tool (Node TS, multi-provider) | `claude-api` |
| 5 | Benchmark suite (6 categories × 5 tasks = 30 tasks for v1) | `agent-designer` |
| 6 | Judge model integration (Claude Haiku 4.5) | `claude-api` |
| 7 | End-to-end integration | `superpowers:verification-before-completion` |
| 8 | SEO pages + OG card generation | `frontend-design` |
| 9 | Deploy to Cloudflare Pages (web) + Render/Fly (backend) | `superpowers:verification-before-completion` |
| 10 | Documentation + README | `doc-coauthoring` |

**Skills used (target: 10+):** brainstorming, writing-plans, nano-banana-2, frontend-design, saasquach-scqa, shadcn-tailwind, brand-guidelines, agent-designer, claude-api, test-driven-development, verification-before-completion, subagent-driven-development, doc-coauthoring. **13 skills**, exceeding the 10 minimum.

## 11. Open Items (Drew approval, in-flight)

- **Tier name set**: Pipeline-domain (Trunk/Mainline/Feeder/Tap/Drip) is my pick. Two alternates documented. Drew override possible at any time.
- **Initial 30 tasks**: catalog needs review pre-launch — Drew sign-off on the public taxonomy before going live.
- **Judge model cost**: Claude Haiku 4.5 re-judging every submission has cost implications at scale. Per-submission cost ~$0.05 — fine for v1, may need to swap to local model later.
- **Domain**: pipelinescore.ai already owned and parked. Site will deploy there once ready.

## 12. Out of Scope (deferred to v2+)

- Multimodal (images, audio).
- Custom deployments (user uploads system prompt / fine-tune config) — the "compare your custom setup to stock" thesis stays as v2 launch.
- Real-time human voting — different product (LMArena exists).
- Mobile app.
- White-label / enterprise tier.
- Sponsored leaderboard slots / commercial dataset licensing — post-traction.
