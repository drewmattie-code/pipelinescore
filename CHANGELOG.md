# Changelog

All notable changes to PipelineScore will be documented here. Format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Top-100 trending local model catalog seeded into the leaderboard
- Non-destructive `augmentIfMissing()` adds new models without wiping user submissions
- `--hardware-tag` CLI flag + persisted with nickname
- `--config-tag` CLI flag for LoRA / system-prompt / persona differentiation
- Efficiency aggregates (total tokens, avg latency, tasks run) on user dashboard
- `api.pipelinescore.ai` custom domain
- Public leaderboard at https://pipelinescore.ai

### Changed
- Hero pitch repivoted to local-first: "Benchmark LLMs on YOUR hardware"
- Provider order in CLI + MCP: `[local, anthropic, openai]` (was anthropic-first)
- README rewritten with comparison table, mermaid architecture diagram, OSS hygiene

## [0.1.0] — 2026-05-23

Initial public release.

### Added
- CLI (`@pipelinescore/cli`) — 25-task benchmark runner with `--user`, `--config-tag`, `--hardware-tag` flags
- Backend (Express + better-sqlite3) — `/v1/leaderboard`, `/v1/leaderboard/users`, `/v1/users/:nickname`, `/v1/submissions`, `/v1/testpack`, `/v1/stats`, `/v1/compare`
- Web (Next.js 16 via OpenNext on Cloudflare Workers) — home, models leaderboard, users leaderboard, per-user dashboard, per-model detail, head-to-head compare, methodology, run, privacy, about
- MCP server (`@pipelinescore/mcp`) — `run_benchmark`, `get_user_leaderboard`, `get_user_profile` tools
- Claude Code skill ([`dist/skills/pipelinescore/SKILL.md`](dist/skills/pipelinescore/SKILL.md))
- HMAC-signed daily testpack rotation for anti-contamination
- Server-side re-judgment via Claude Haiku 4.5
- Layered rate limiting (20/IP/hr, 100/nick/day, 5/(nick,model)/hr)
- Event log (90-day TTL) + transcript retention (30-day TTL)
- Privacy page + retention policy enforcement

Apache 2.0 licensed.

---

Releases are tagged in GitHub. Subscribe to [Releases](https://github.com/drewmattie-code/pipelinescore/releases) for notifications.
