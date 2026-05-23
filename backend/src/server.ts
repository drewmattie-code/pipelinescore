import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { seedIfEmpty } from './seed.js';
import health from './routes/health.js';
import testpack from './routes/testpack.js';
import submissions from './routes/submissions.js';
import leaderboard from './routes/leaderboard.js';
import models from './routes/models.js';
import compare from './routes/compare.js';
import users from './routes/users.js';
import { stamp } from './lib/api-version.js';
import { readLimiter, submitLimiter } from './lib/rate-limit.js';

const PORT = parseInt(process.env.PORT ?? '4601', 10);
const ALLOWED_ORIGINS = ['http://localhost:4600', 'http://localhost:4500'];

migrate();
seedIfEmpty();

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

app.listen(PORT, () => {
  console.log(`[pipelinescore-api] listening on http://localhost:${PORT}`);
});
