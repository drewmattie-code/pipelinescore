import { spawn } from 'node:child_process';

const PYTHON = process.env.PS_PYTHON ?? 'python3';

export interface PyExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runPython(script: string, timeoutMs = 8000): Promise<PyExecResult> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON, ['-c', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
    }, timeoutMs);
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
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
