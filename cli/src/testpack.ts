import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Taxonomy, Testpack } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from src/ or dist/ to the repo, then into benchmarks/.
const BENCHMARKS_DIR = resolve(__dirname, '..', '..', 'benchmarks');

export async function loadLocalTaxonomy(): Promise<Taxonomy> {
  const raw = await readFile(resolve(BENCHMARKS_DIR, 'taxonomy.json'), 'utf8');
  return JSON.parse(raw) as Taxonomy;
}

export async function loadLocalTestpack(): Promise<Testpack> {
  const raw = await readFile(resolve(BENCHMARKS_DIR, 'tasks-v2.json'), 'utf8');
  return JSON.parse(raw) as Testpack;
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
