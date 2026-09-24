import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Sandbox, SandboxRun } from './types.js';

// Model-written code only ever runs here: no network, capped memory/CPU/pids,
// read-only root, throwaway working copy, non-root user.
export const SANDBOX_IMAGES = { python: 'python:3.12-alpine', node: 'node:22-alpine' } as const;

export function dockerStatus(): { ok: boolean; reason?: string } {
  const r = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15000 });
  if (r.error) return { ok: false, reason: 'Docker is not installed. Install Docker Desktop (or Docker Engine) and try again.' };
  if (r.status !== 0) return { ok: false, reason: 'Docker is installed but not running. Start Docker and try again.' };
  return { ok: true };
}

export function ensureImages(): void {
  for (const image of Object.values(SANDBOX_IMAGES)) {
    const have = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
    if (have.status === 0) continue;
    process.stdout.write(`Pulling sandbox image ${image} (one time)...\n`);
    const pull = spawnSync('docker', ['pull', '-q', image], { stdio: 'inherit' });
    if (pull.status !== 0) throw new Error(`could not pull ${image}`);
  }
}

export class DockerSandbox implements Sandbox {
  async run(opts: { image: 'python' | 'node'; files: Record<string, string>; cmd: string[]; timeoutMs?: number }): Promise<SandboxRun> {
    const dir = mkdtempSync(join(tmpdir(), 'ps-sbx-'));
    try {
      for (const [rel, content] of Object.entries(opts.files)) {
        const p = join(dir, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, content);
      }
      const name = `ps-sbx-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const args = [
        'run', '--rm', '--name', name,
        '--network', 'none',
        '--memory', '512m', '--memory-swap', '512m',
        '--cpus', '1', '--pids-limit', '128',
        '--read-only', '--tmpfs', '/tmp:rw,size=64m',
        '--user', '65534:65534',
        '-v', `${dir}:/work:ro`, '-w', '/work',
        '-e', 'PYTHONDONTWRITEBYTECODE=1', '-e', 'HOME=/tmp',
        SANDBOX_IMAGES[opts.image],
        ...opts.cmd,
      ];
      return await exec('docker', args, opts.timeoutMs ?? 20000, name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function exec(bin: string, args: string[], timeoutMs: number, container: string): Promise<SandboxRun> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cap = 200_000;
    child.stdout.on('data', (d) => { if (stdout.length < cap) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < cap) stderr += d; });
    // Killing the docker client alone leaves the container running.
    const timer = setTimeout(() => {
      timedOut = true;
      spawnSync('docker', ['kill', container], { stdio: 'ignore' });
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr, timedOut });
    });
  });
}
