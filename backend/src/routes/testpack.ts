import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign } from '../lib/sign.js';
import { stamp } from '../lib/api-version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_PATH = resolve(__dirname, '..', '..', '..', 'benchmarks', 'tasks-v1.json');

const router: Router = Router();

router.get('/v1/testpack', (_req, res) => {
  try {
    const raw = readFileSync(TASKS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { version: string; tasks: unknown[] };
    const payload = {
      version: parsed.version,
      tasks: parsed.tasks,
    };
    const signature = sign(JSON.stringify(payload));
    res.json(stamp({ ...payload, signature }));
  } catch (err) {
    res.status(500).json(stamp({ error: 'failed_to_load_testpack', detail: (err as Error).message }));
  }
});

export default router;
