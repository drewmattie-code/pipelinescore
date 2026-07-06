import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedVersion: string | undefined;

/**
 * The CLI's real version, read from package.json so the banner, --version,
 * and the submitted cli_version can never drift from what was published.
 * Resolves from both layouts: dist/*.js and src/*.ts sit one level below
 * the package root.
 */
export function cliVersion(): string {
  if (cachedVersion) return cachedVersion;
  for (const rel of ['..', '../..']) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(__dirname, rel, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg?.name === '@pipelinescore/cli' && typeof pkg.version === 'string') {
        cachedVersion = pkg.version;
        return cachedVersion;
      }
    } catch {
      // keep looking
    }
  }
  cachedVersion = '0.0.0';
  return cachedVersion;
}

// A real user submitted to the public leaderboard as "yourusername" after
// copy-pasting a docs example verbatim. Refuse the well-known placeholders so
// the board never collects another one; the same list is enforced server-side.
const PLACEHOLDER_NICKNAMES = new Set([
  'yourusername',
  'your-username',
  'your_username',
  'yourname',
  'your-name',
  'your_name',
  'your-handle',
  'your_handle',
  'yourhandle',
  'your-nickname',
  'username',
  'nickname',
  'handle',
  'user',
  'changeme',
  'change-me',
  'anonymous',
  'anon',
  'example',
  'test-user',
  'admin',
  'root',
  'moderator',
  'official',
  'staff',
  'pipelinescore',
]);

export function isPlaceholderNickname(nickname: string): boolean {
  return PLACEHOLDER_NICKNAMES.has(nickname.toLowerCase());
}

/**
 * Every common local server (Ollama, LM Studio, llama.cpp, vLLM, MLX-Omni,
 * LiteLLM) serves its OpenAI-compatible API under /v1, but people naturally
 * pass the bare origin (http://localhost:11434). The openai client uses the
 * base URL verbatim, so without this every task 404s and the run scores 0.
 * Appends /v1 only when no path was given; an explicit path is respected.
 */
export function normalizeLocalEndpoint(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname === '' || u.pathname === '/') u.pathname = '/v1';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}
