import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { seedIfEmpty, augmentIfMissing, purgeClosedModelsIfPresent, normalizePlaceholderNicknamesIfPresent } from './seed.js';
import health from './routes/health.js';
import testpack from './routes/testpack.js';
import submissions from './routes/submissions.js';
import leaderboard from './routes/leaderboard.js';
import models from './routes/models.js';
import compare from './routes/compare.js';
import users from './routes/users.js';
import { stamp } from './lib/api-version.js';
import { readLimiter, submitLimiter } from './lib/rate-limit.js';
import { eventLogger } from './lib/event-log.js';
import { startRetention } from './lib/retention.js';

const PORT = parseInt(process.env.PORT ?? '4601', 10);

// CORS allowlist. Defaults to localhost dev ports; production hosts (Render,
// Fly, etc.) set ALLOWED_ORIGINS as a comma-separated list:
//   ALLOWED_ORIGINS=https://pipelinescore.ai,https://pipelinescore.pages.dev
const DEFAULT_ORIGINS = ['http://localhost:4600', 'http://localhost:4500'];
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ORIGINS
);
console.log(`[pipelinescore-api] CORS allowlist: ${ALLOWED_ORIGINS.join(', ')}`);

migrate();
// One-time scrub: removes seed submissions of closed-weights API models
// (Claude / GPT / Gemini / etc.) that earlier seed versions populated.
// Closed-weights models can't run on local hardware tags — keeping the
// sample leaderboard honest. Idempotent.
purgeClosedModelsIfPresent();
// One-time scrub: applies the placeholder-nickname policy retroactively to rows
// that predate the submit-route check, so a real run posted as "yourusername"
// becomes anonymous instead of headlining the board. Idempotent.
normalizePlaceholderNicknamesIfPresent();
seedIfEmpty();
// Non-destructive: adds any models from LOCAL_MODELS that aren't already
// in the DB, plus a few hardware-distributed sample submissions per new
// model. Safe over a populated persistent disk.
augmentIfMissing();

const app = express();
// Trust the reverse proxy (Fly, Cloudflare, etc.) so req.ip is the real client IP.
// In dev (no proxy), this is harmless.
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed: ' + origin));
    },
  })
);

// Event logger BEFORE the rate limiters so we capture 429s too (they're signal).
app.use(eventLogger);

// Apply read limiter to ALL GETs; submissions get a stricter layered limiter.
app.use((req, res, next) => {
  if (req.method === 'GET') return readLimiter(req, res, next);
  next();
});
app.use('/v1/submissions', (req, res, next) => {
  if (req.method === 'POST') return submitLimiter(req, res, next);
  next();
});

app.use(health);
app.use(testpack);
app.use(submissions);
app.use(leaderboard);
app.use(models);
app.use(compare);
app.use(users);

app.use((_req, res) => {
  res.status(404).json(stamp({ error: 'not_found' }));
});

// Retention TTL — nullifies transcripts >30d, deletes events >90d. Hourly.
startRetention();

app.listen(PORT, () => {
  console.log(`[pipelinescore-api] listening on http://localhost:${PORT}`);
});
