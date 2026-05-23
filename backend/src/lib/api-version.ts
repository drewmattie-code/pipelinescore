// PipelineScore API v1 contract markers.
//
// Locked 2026-05-23. Once distributed via skills/MCP, changing this shape
// breaks every installed client. Add fields, never rename/remove. Bump to
// /v2 for breaking changes; keep /v1 alive forever alongside.
export const API_VERSION = 'v1' as const;

/** Wrap an object with the api_version stamp. */
export function stamp<T extends object>(payload: T): T & { api_version: typeof API_VERSION } {
  return { api_version: API_VERSION, ...payload };
}

/** Convert SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) into proper ISO 8601 with Z suffix. */
export function toIsoDate(sqliteDate: string | null | undefined): string | null {
  if (!sqliteDate) return null;
  // Already ISO?
  if (sqliteDate.includes('T')) return sqliteDate;
  // SQLite CURRENT_TIMESTAMP returns UTC; tag with Z.
  return sqliteDate.replace(' ', 'T') + 'Z';
}
