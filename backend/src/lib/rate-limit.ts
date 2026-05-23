// Rate limiting for the public PipelineScore API.
//
// Layered limits — each layer protects against a different abuse vector.
// In-memory store; fine for single-instance deploys. Swap to Redis-backed
// (rate-limit-redis) when scaling horizontally.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { stamp } from './api-version.js';

// ---- Reads ------------------------------------------------------------------
// Browsing the leaderboard / model pages / user dashboards.
// Loose — meant to absorb normal browsing, not a hard ceiling.
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1 minute
  limit: 200,                   // 200 requests per IP per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: stamp({ error: 'rate_limited', layer: 'read_per_ip', retry_after_seconds: 60 }),
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

// ---- Writes (POST /v1/submissions) ------------------------------------------
// Three concurrent limits via middleware chain.

// Layer 1: per-IP — 20 / hour. Kills obvious bot floods.
export const submitPerIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: stamp({ error: 'rate_limited', layer: 'submit_per_ip', retry_after_seconds: 3600 }),
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`,
});

// Layer 2: per-nickname — 100 / day. Prevents one user padding the board.
export const submitPerNicknameLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: stamp({ error: 'rate_limited', layer: 'submit_per_nickname', retry_after_seconds: 86400 }),
  keyGenerator: (req: Request) => {
    const body = req.body as { user_nickname?: unknown } | undefined;
    const nick = typeof body?.user_nickname === 'string' ? body.user_nickname : null;
    // Anonymous submissions hit the per-IP limit; nickname limit only applies when a nickname is set.
    return nick ? `nick:${nick}` : `nick:anon:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
});

// Layer 3: per-(nickname, model) — 5 / hour. Prevents stat-padding one specific model.
export const submitPerNicknameModelLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: stamp({ error: 'rate_limited', layer: 'submit_per_nickname_model', retry_after_seconds: 3600 }),
  keyGenerator: (req: Request) => {
    const body = req.body as { user_nickname?: unknown; model?: { slug?: unknown } } | undefined;
    const nick = typeof body?.user_nickname === 'string' ? body.user_nickname : 'anon';
    const slug = typeof body?.model?.slug === 'string' ? body.model.slug : 'unknown';
    return `nickmodel:${nick}:${slug}`;
  },
});

// Combine all three submission layers. Apply with: app.use('/v1/submissions', submitLimiter)
export function submitLimiter(req: Request, res: Response, next: NextFunction): void {
  submitPerIpLimiter(req, res, (err) => {
    if (err) return next(err);
    submitPerNicknameLimiter(req, res, (err2) => {
      if (err2) return next(err2);
      submitPerNicknameModelLimiter(req, res, next);
    });
  });
}
