// First 50 Beta Testers — the first 50 unique nicknames that submitted a
// real (non-seed) benchmark run get a permanent badge next to their name.
//
// "Real" = submitter_ip != 'seed' (the synthetic submissions inserted by
// seed.ts and augmentIfMissing use submitter_ip = 'seed').
//
// Ordered by each nickname's FIRST real submission timestamp, so once the
// list hits 50 entries it's locked — late submitters don't bump earlier ones.
import { db } from '../db.js';

const FIRST_BETA_CAP = 50;

interface BetaTesterRow {
  user_nickname: string;
  first_submission_at: string;
}

// Cache the lookup for a short period since this is called on every
// /v1/leaderboard/users + /v1/users/:nickname response. Cheap when there
// are <1k real submissions; the cache covers the spike-traffic case.
let cached: { rankByNickname: Map<string, number>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 sec

function computeRankMap(): Map<string, number> {
  // Pick the earliest real submission per nickname, sort, take top 50.
  const rows = db
    .prepare(
      `SELECT user_nickname, MIN(created_at) AS first_submission_at
         FROM submissions
        WHERE submitter_ip IS NOT NULL
          AND submitter_ip != 'seed'
          AND user_nickname IS NOT NULL
          AND user_nickname != ''
        GROUP BY user_nickname
        ORDER BY first_submission_at ASC
        LIMIT ?`
    )
    .all(FIRST_BETA_CAP) as BetaTesterRow[];

  const map = new Map<string, number>();
  rows.forEach((row, idx) => {
    map.set(row.user_nickname, idx + 1); // 1-indexed rank
  });
  return map;
}

export function getBetaTesterRankMap(): Map<string, number> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.rankByNickname;
  cached = { rankByNickname: computeRankMap(), expiresAt: now + CACHE_TTL_MS };
  return cached.rankByNickname;
}

export function getBetaTesterRank(nickname: string | null | undefined): number | null {
  if (!nickname) return null;
  const map = getBetaTesterRankMap();
  return map.get(nickname) ?? null;
}

export const BETA_TESTER_CAP = FIRST_BETA_CAP;
