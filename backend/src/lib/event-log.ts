// Request event log — fires once per response (on res.finish).
//
// Records: method, path, status, latency_ms, ip, user_nickname (from POST body),
// user-agent, bytes_out. NO request/response bodies. Used for product analytics,
// rate-limit research, and (eventually) monetizable insights.
//
// Retention: 90 days (see retention.ts).
import type { Request, Response, NextFunction } from 'express';
import type { Statement } from 'better-sqlite3';
import { db, uid } from '../db.js';

// Skip noisy endpoints that would flood the table with no analytic value.
const SKIP_PATHS = new Set<string>(['/health', '/favicon.ico']);

// Lazy-init the prepared statement. We can't prepare at module load time
// because that runs BEFORE server.ts calls migrate(), and on a fresh DB the
// events table doesn't exist yet.
let insertEvent: Statement | null = null;
function getInsertEvent(): Statement {
  if (!insertEvent) {
    insertEvent = db.prepare(`
      INSERT INTO events (id, ts, method, path, status, latency_ms, ip, user_nickname, ua, bytes_out)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return insertEvent;
}

function extractNickname(req: Request): string | null {
  const body = req.body as { user_nickname?: unknown } | undefined;
  if (body && typeof body.user_nickname === 'string') return body.user_nickname;
  // GET /v1/users/:nickname carries the nickname in the path
  const m = /^\/v1\/users\/([^/]+)/.exec(req.path);
  if (m) return decodeURIComponent(m[1]);
  // /v1/leaderboard/users?user=foo / ?search=foo (search is partial match — only log user=)
  if (typeof req.query.user === 'string') return req.query.user;
  return null;
}

export function eventLogger(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path)) return next();

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const latencyMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
      const bytesOutHeader = res.getHeader('content-length');
      const bytesOut =
        typeof bytesOutHeader === 'string'
          ? parseInt(bytesOutHeader, 10) || null
          : typeof bytesOutHeader === 'number'
            ? bytesOutHeader
            : null;
      getInsertEvent().run(
        uid(),
        new Date().toISOString(),
        req.method,
        req.path.slice(0, 200), // hard cap to keep the row small
        res.statusCode,
        latencyMs,
        req.ip ?? null,
        extractNickname(req),
        (req.get('user-agent') ?? '').slice(0, 200) || null,
        bytesOut,
      );
    } catch {
      // Never let logging crash a request.
    }
  });
  next();
}
