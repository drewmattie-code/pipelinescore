import { Router } from 'express';
import { db } from '../db.js';
import { stamp } from '../lib/api-version.js';

const router: Router = Router();

router.get('/health', (_req, res) => {
  const models = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c;
  const submissions = (db.prepare('SELECT COUNT(*) AS c FROM submissions').get() as { c: number }).c;
  res.json(stamp({
    status: 'ok',
    service: 'pipelinescore-api',
    version: '0.1.0',
    db: { models, submissions },
    time: new Date().toISOString(),
  }));
});

// Public site-stats endpoint — used by the homepage live-counts strip.
router.get('/v1/stats', (_req, res) => {
  const submission_count = (db.prepare('SELECT COUNT(*) AS c FROM submissions').get() as { c: number }).c;
  const user_count = (db
    .prepare('SELECT COUNT(DISTINCT user_nickname) AS c FROM submissions WHERE user_nickname IS NOT NULL')
    .get() as { c: number }).c;
  const model_count = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c;
  res.json(stamp({ submission_count, user_count, model_count }));
});

export default router;
