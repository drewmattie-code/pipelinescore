import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Taxonomy, Testpack } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The public benchmark files must resolve in two layouts:
//  - published npm package: bundled next to the compiled entry (dist/benchmarks),
//    copied in at publish time (scripts/copy-benchmarks.mjs) — only the public
//    task set + taxonomy, never the private held-out pool.
//  - monorepo (dev): the repo-root benchmarks/ directory.
const BUNDLED_DIR = resolve(__dirname, 'benchmarks');
const MONOREPO_DIR = resolve(__dirname, '..', '..', 'benchmarks');

async function readBenchmark(file: string): Promise<string> {
  try {
    return await readFile(resolve(BUNDLED_DIR, file), 'utf8');
  } catch {
    return await readFile(resolve(MONOREPO_DIR, file), 'utf8');
  }
}

export async function loadLocalTaxonomy(): Promise<Taxonomy> {
  return JSON.parse(await readBenchmark('taxonomy.json')) as Taxonomy;
}

export async function loadLocalTestpack(): Promise<Testpack> {
  return JSON.parse(await readBenchmark('tasks-v2.json')) as Testpack;
}

export async function fetchTestpack(endpoint: string, timeoutMs = 3000): Promise<Testpack | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${endpoint}/v1/testpack`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as Testpack;
  } catch {
    return null;
  }
}
