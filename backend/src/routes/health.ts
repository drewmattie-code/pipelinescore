import { Router } from 'express';
import { db } from '../db.js';

const router: Router = Router();

router.get('/health', (_req, res) => {
  const models = (db.prepare('SELECT COUNT(*) AS c FROM models').get() as { c: number }).c;
  const submissions = (db.prepare('SELECT COUNT(*) AS c FROM submissions').get() as { c: number }).c;
  res.json({
    status: 'ok',
    service: 'pipelinescore-api',
    version: '0.1.0',
    db: { models, submissions },
    time: new Date().toISOString(),
  });
});

export default router;
