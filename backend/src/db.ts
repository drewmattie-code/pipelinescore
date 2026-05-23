import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DB path: ~/Projects/pipelinescore/backend/.data/pipelinescore.db
const DB_PATH = resolve(__dirname, '..', '.data', 'pipelinescore.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id              TEXT PRIMARY KEY,
      slug            TEXT UNIQUE NOT NULL,
      display_name    TEXT NOT NULL,
      provider        TEXT NOT NULL,
      provider_model  TEXT NOT NULL,
      family          TEXT,
      released_at     TEXT,
      context_window  INTEGER,
      metadata        TEXT,
      created_at      TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id               TEXT PRIMARY KEY,
      model_id         TEXT NOT NULL REFERENCES models(id),
      testpack_version TEXT NOT NULL,
      pipeline_score   REAL NOT NULL,
      tier             TEXT NOT NULL,
      category_scores  TEXT NOT NULL,
      raw_transcripts  TEXT NOT NULL,
      cli_version      TEXT NOT NULL,
      submitter_ip     TEXT,
      user_id          TEXT,
      user_nickname    TEXT,
      config_tag       TEXT,
      lab_verified     INTEGER DEFAULT 0,
      notes            TEXT,
      created_at       TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_subs_model ON submissions(model_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subs_score ON submissions(pipeline_score DESC);

    CREATE TABLE IF NOT EXISTS task_results (
      id              TEXT PRIMARY KEY,
      submission_id   TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      task_id         TEXT NOT NULL,
      category        TEXT NOT NULL,
      task_input      TEXT NOT NULL,
      model_output    TEXT NOT NULL,
      judge_score     REAL,
      passed          INTEGER,
      latency_ms      INTEGER,
      tokens_used     INTEGER,
      judge_rationale TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_results_sub ON task_results(submission_id);
  `);

  // Idempotent column adds for older DBs. SQLite won't add a column twice;
  // we catch and ignore the "duplicate column" error.
  for (const col of ['user_nickname TEXT', 'config_tag TEXT']) {
    try {
      db.exec(`ALTER TABLE submissions ADD COLUMN ${col}`);
    } catch (err) {
      if (!String(err).includes('duplicate column')) throw err;
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subs_user ON submissions(user_nickname, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subs_config ON submissions(config_tag)`);
}

export function uid(): string {
  // Lightweight UUIDv4-ish (good enough for local-first SQLite — not security-sensitive)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
