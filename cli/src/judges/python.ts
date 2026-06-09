import { spawn } from 'node:child_process';

const PYTHON = process.env.PS_PYTHON ?? 'python3';

export interface PyExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Minimal environment for the judge subprocess. We strip the parent process
// env so model-generated code cannot read the user's secrets (e.g. their
// ANTHROPIC_API_KEY / OPENAI_API_KEY) out of process.env and exfiltrate them;
// only the handful of vars Python needs to launch are passed through.
// NOTE: this is NOT full sandboxing — there is no network/filesystem isolation,
// which would require an OS container/seccomp. The judge still runs the model's
// generated code locally, by design (it's a code-execution benchmark).
function safeEnv(): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '' };
  for (const k of ['LANG', 'LC_ALL', 'LC_CTYPE', 'SystemRoot', 'PATHEXT', 'TEMP', 'TMP', 'HOME']) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

const MAX_CAPTURE = 512 * 1024; // cap stdout/stderr so a runaway print can't exhaust memory

export function runPython(script: string, timeoutMs = 8000): Promise<PyExecResult> {
  return new Promise((resolve) => {
    // -I = isolated mode: ignore PYTHONPATH / user site-packages / env config.
    const proc = spawn(PYTHON, ['-I', '-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: safeEnv(),
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
    }, timeoutMs);
    proc.stdout.on('data', (d) => {
      if (stdout.length < MAX_CAPTURE) stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      if (stderr.length < MAX_CAPTURE) stderr += d.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: -1 });
    });
  });
}

/**
 * Strip common markdown fences and surrounding chatter from a code response.
 * Models routinely ignore "no fences, no commentary" and we don't want to
 * zero-score them for that — we want to score the code itself.
 */
export function stripCodeFences(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```(?:python|py|sql|javascript|js|json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fence) t = fence[1].trim();
  // also try matching the first fenced block if there's surrounding prose
  if (!fence) {
    const inner = t.match(/```(?:python|py|sql|javascript|js|json)?\s*\n([\s\S]*?)\n```/i);
    if (inner) t = inner[1].trim();
  }
  return t;
}
