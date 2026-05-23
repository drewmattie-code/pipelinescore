// Retention policy enforcer.
//
// Privacy posture: users submit prompt + model output for transparency in scoring.
// That's useful for ~30 days (audit trail, dispute resolution), then becomes
// pure liability — old prompts may contain PII, internal docs, API keys that
// users didn't realize they were uploading. So we keep transcripts 30 days,
// then nullify them while leaving the score row intact.
//
// Event log keeps 90 days for product-analytics + abuse research, then deletes.
import { db } from '../db.js';

const TRANSCRIPT_TTL_DAYS = 30;
const EVENT_LOG_TTL_DAYS = 90;
const RUN_INTERVAL_MS = 60 * 60 * 1000; // hourly

interface RetentionResult {
  transcripts_redacted: number;
  task_outputs_redacted: number;
  events_deleted: number;
}

export function runRetention(): RetentionResult {
  const txn = db.transaction((): RetentionResult => {
    // Nullify raw_transcripts on old submissions (preserve the score, drop the body)
    const subRes = db
      .prepare(
        `UPDATE submissions
           SET raw_transcripts = '{"redacted":true,"reason":"30d_ttl"}'
         WHERE created_at < datetime('now', ?)
           AND raw_transcripts IS NOT NULL
           AND raw_transcripts NOT LIKE '%redacted%'`
      )
      .run(`-${TRANSCRIPT_TTL_DAYS} days`);

    // Redact per-task inputs + outputs on the same window. The columns are
    // NOT NULL, so we overwrite with a marker rather than nulling.
    const REDACTED = '[redacted:30d_ttl]';
    const taskRes = db
      .prepare(
        `UPDATE task_results
           SET task_input = ?, model_output = ?
         WHERE submission_id IN (
           SELECT id FROM submissions WHERE created_at < datetime('now', ?)
         )
           AND (task_input != ? OR model_output != ?)`
      )
      .run(REDACTED, REDACTED, `-${TRANSCRIPT_TTL_DAYS} days`, REDACTED, REDACTED);

    // Hard-delete old event-log rows
    const evRes = db
      .prepare(`DELETE FROM events WHERE ts < datetime('now', ?)`)
      .run(`-${EVENT_LOG_TTL_DAYS} days`);

    return {
      transcripts_redacted: subRes.changes,
      task_outputs_redacted: taskRes.changes,
      events_deleted: evRes.changes,
    };
  });
  return txn();
}

/** Schedule retention. Runs once on call, then hourly via setInterval. */
export function startRetention(): NodeJS.Timeout {
  const log = (r: RetentionResult): void => {
    if (r.transcripts_redacted + r.task_outputs_redacted + r.events_deleted > 0) {
      console.log(
        `[retention] transcripts_redacted=${r.transcripts_redacted} task_outputs_redacted=${r.task_outputs_redacted} events_deleted=${r.events_deleted}`,
      );
    }
  };
  log(runRetention());
  return setInterval(() => {
    try {
      log(runRetention());
    } catch (err) {
      console.error('[retention] failed:', (err as Error).message);
    }
  }, RUN_INTERVAL_MS);
}

export const RETENTION_POLICY = {
  transcripts_days: TRANSCRIPT_TTL_DAYS,
  events_days: EVENT_LOG_TTL_DAYS,
  enforcement: 'hourly background job',
} as const;
