# Security Policy

PipelineScore is BYOK (Bring Your Own Key) for frontier API runs, and zero-key for local runs. This document spells out exactly what data flows where, and how to report a security issue.

## Reporting a vulnerability

Email **security@pipelinescore.ai** with:
- A description of the vulnerability
- Steps to reproduce
- Affected versions (CLI, MCP server, backend)
- Your suggested fix if you have one

We'll acknowledge within 48 hours and aim to ship a patch within 7 days for high-severity issues. We won't run a bug bounty, but we'll credit you in the changelog if you want public recognition.

**Do not** open a public GitHub issue for security reports. Email first.

## Data flow

### Local provider (`--provider local`)
```
[your machine]
  CLI -> http://localhost:<port> (your model server)   ✅ never leaves your machine
       -> https://api.pipelinescore.ai/v1/submissions  (score + transcripts)
```
No API key involved. The CLI doesn't ship telemetry, doesn't phone home except to submit the score, doesn't read any env var beyond what you pass.

### Frontier provider (`--provider anthropic | openai`)
```
[your machine]
  $ANTHROPIC_API_KEY -> [your shell env] -> [CLI process memory]
                                         -> https://api.anthropic.com (provider)  ✅
                                         -> NEVER sent to api.pipelinescore.ai

  CLI -> https://api.pipelinescore.ai/v1/submissions  (score + transcripts, NO KEY)
```
Your key is read from env (or `--api-key`), passed to the official `@anthropic-ai/sdk` or `openai` SDK, used to make HTTPS calls to the provider, then dropped on CLI exit. **It is never logged, never persisted to disk by the CLI, and never included in the submission body sent to our backend.**

### What our backend receives
- Model identifier (slug, display name, provider, family)
- Score + tier + per-category scores
- Optional: nickname, hardware tag, config tag
- Per-task input + output transcripts (for re-judgment)
- Latency + tokens-used per task
- Client IP + user-agent (for rate-limit enforcement, dropped after 90 days)

### What our backend never sees
- Your provider API key
- Your local server URL beyond what's in the model identifier
- Any environment variable from your machine
- Filesystem contents
- Anything you didn't explicitly pass to the CLI

## Retention

- **Transcripts** (raw prompt + model output): 30 days, then overwritten with `[redacted:30d_ttl]`. The score row remains permanent.
- **Event log** (request metadata): 90 days, then hard-deleted.
- **Submissions** (score, tier, model, hardware tag, nickname): permanent — that's the whole point of the leaderboard.

Enforced by [`backend/src/lib/retention.ts`](backend/src/lib/retention.ts) running on startup and every hour.

## Trust boundaries

| Component | Who controls it | Trust level |
|---|---|---|
| The npm package `@pipelinescore/cli` | Charles & Roe (signed publishes via npm provenance attestations) | Verify provenance on install |
| Transitive deps | Various maintainers | `npm audit clean` on every release |
| The backend at `api.pipelinescore.ai` | Charles & Roe (Render-hosted, persistent disk on Render-managed infra) | Logs publicly published; data retention policy enforced in code |
| The frontend at `pipelinescore.ai` | Charles & Roe (Cloudflare Workers via OpenNext) | Read-only — doesn't accept submissions |
| Your model server (Ollama / LM Studio / etc.) | You | Whatever you've configured |
| Your provider key | You + the provider (Anthropic / OpenAI) | Set a spending cap before benchmarking |

## Recommendations for users

1. **For frontier API runs**: create a scoped key with a low spending cap (Anthropic + OpenAI both support this). Rotate after testing if you're concerned.
2. **Pin the CLI version** (e.g. `npx @pipelinescore/cli@0.1.0`) in scripts that run unattended, so an updated package can't surprise you.
3. **Audit submissions before public posting** if you're benchmarking proprietary prompts. PipelineScore stores transcripts publicly until the 30d redaction kicks in.
4. **Don't pass `--user` for ad-hoc tests** if you don't want them on the public leaderboard. Submissions without `--user` show as anonymous and don't appear on the user leaderboard.

## Disclosure history

No disclosed vulnerabilities to date. We'll publish history here as a table once any are resolved.
