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

const PORT = parseInt(process.env.PORT ?? '4601', 10);
const ALLOWED_ORIGINS = ['http://localhost:4600', 'http://localhost:4500'];

migrate();
seedIfEmpty();

const app = express();
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

app.use(health);
app.use(testpack);
app.use(submissions);
app.use(leaderboard);
app.use(models);
app.use(compare);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, () => {
  console.log(`[pipelinescore-api] listening on http://localhost:${PORT}`);
});
