# Changelog

All notable changes to PipelineScore will be documented here. Format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-07-06

The "it just works" release: every documented command now works verbatim, and the no-flags path is the front door.

### Added
- **Zero-config wizard** — `npx @pipelinescore/cli` with no arguments probes localhost for Ollama / LM Studio / llama.cpp / MLX-Omni / vLLM / LiteLLM, lists the models the server is actually serving, asks for an optional nickname, and runs. Non-TTY callers get the detection result plus a ready-to-paste `run` command instead of a hung prompt.
- **`/s/<id>` share pages** — the share URL printed on every score card now resolves to a real page (score, tier, category bars, rig/user chips, run-it-yourself CTA). The CLI also anchors the backend's relative share path to the site, so the card prints a clickable link.
- Preflight warning when Python 3 is missing (code-execution tasks would score 0); Windows `python` fallback when `python3` isn't on PATH.
- End-of-run nudges: star ask after every card, leaderboard invite on `--no-submit` runs.

### Fixed
- **Bare local endpoints work** — `--endpoint http://localhost:11434` (as every doc showed) used to 404 on all 34 tasks and submit a 0 score, because the OpenAI client uses the base URL verbatim. The CLI now appends `/v1` to path-less origins; all docs show `/v1` explicitly.
- **Speed no longer displays as 0.0** — v3 kept speed only in `score_detail`; the card and the site now surface the measured throughput score, and new submissions carry `speed` in `category_scores`.
- **Placeholder nicknames blocked** — a real run landed on the public board as "yourusername". The CLI rejects the well-known placeholders up front; the backend normalizes them to anonymous for older clients.
- **Anonymous submissions stay anonymous** — a boot-time backfill was stamping random seed-pool nicknames onto any submission without one, fabricating identities on real community runs. Removed.
- **Model board no longer empties with age** — `/v1/leaderboard` defaulted to a 30-day window (the users board already used 365), so the homepage collapsed to near-empty once early runs aged out. Default is now 365 days and the site pins it explicitly.
- Version strings (banner, `--version`, submitted `cli_version`) read from package.json — all three were hardcoded to `0.1.0`.
- Reasoning models no longer starve: per-task `max_tokens` raised 1024 → 2048 (thinking tokens were exhausting the budget before the final answer).
- Submission failures now include the server's error detail, and unknown-endpoint responses explain the `/v1` convention instead of `Cannot read properties of undefined`.
- `GET /v1/submissions/:id` now returns `user_nickname`, `hardware_tag`, `config_tag`, and `score_detail` (powers the share page). The Claude-skill file is actually served at `pipelinescore.ai/skills/pipelinescore/SKILL.md` (it 404'd) and rewritten to v3 truth.

## [0.3.0] — 2026-06-10

- v3 methodology: fully deterministic, fully local, no API key ever (userbenchmark model) — dropped the judge-graded `write` category, 34-task pack
- UserBenchmark-style site refresh: dense model board homepage, hardware board, rig head-to-heads, percentiles, search, value column
- npm: `@pipelinescore/cli@0.3.0` published

## [0.2.0] — 2026-06-10

- v2 scoring engine: confidence bands (Student-t), throughput-based speed, weighting profiles, 48-task pack
- Security: bundled-testpack execution only (no network testpack), sandboxed python judge (`-I`, stripped env, output caps)
- Server-side awareness of `score_detail`; leaderboard profile ranking

## [0.1.x era — pre-v2 groundwork]

- Top-100 trending local model catalog seeded into the leaderboard; non-destructive `augmentIfMissing()`
- `--hardware-tag` / `--config-tag` flags, persisted with nickname; efficiency aggregates on user dashboard
- `api.pipelinescore.ai` custom domain; hero repivoted local-first; provider order `[local, anthropic, openai]`

## [0.1.0] — 2026-05-23

Initial public release.

### Added
- CLI (`@pipelinescore/cli`) — 25-task benchmark runner with `--user`, `--config-tag`, `--hardware-tag` flags
- Backend (Express + better-sqlite3) — `/v1/leaderboard`, `/v1/leaderboard/users`, `/v1/users/:nickname`, `/v1/submissions`, `/v1/testpack`, `/v1/stats`, `/v1/compare`
- Web (Next.js 16 via OpenNext on Cloudflare Workers) — home, models leaderboard, users leaderboard, per-user dashboard, per-model detail, head-to-head compare, methodology, run, privacy, about
- MCP server (`@pipelinescore/mcp`) — `run_benchmark`, `get_user_leaderboard`, `get_user_profile` tools
- Claude Code skill ([`web/public/skills/pipelinescore/SKILL.md`](web/public/skills/pipelinescore/SKILL.md))
- HMAC-signed daily testpack rotation for anti-contamination
- Server-side re-judgment via Claude Haiku 4.5
- Layered rate limiting (20/IP/hr, 100/nick/day, 5/(nick,model)/hr)
- Event log (90-day TTL) + transcript retention (30-day TTL)
- Privacy page + retention policy enforcement

Apache 2.0 licensed.

---

Releases are tagged in GitHub. Subscribe to [Releases](https://github.com/drewmattie-code/pipelinescore/releases) for notifications.
