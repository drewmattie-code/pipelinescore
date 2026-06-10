import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Task, Testpack } from './types.js';

// Private rotating held-out set for canonical lab-verified runs.
//
// The held-out pool is NOT shipped in the public repo (it is gitignored and the
// lab provides it via --holdout or PS_HOLDOUT_FILE). For a run, a deterministic,
// seed-rotated subset is selected per category. This mirrors the SGCT
// signed-rotating-testpack idea: reproducible by the lab from the seed, but
// unpredictable to a model author because the pool is private and the subset
// rotates, so the trusted ranking cannot be trained on or pre-tuned against.

function rank(seed: string, id: string): string {
  return createHash('sha256').update(`${seed}|${id}`).digest('hex');
}

export async function loadHoldout(path: string, seed: string, perCategory = 5): Promise<Testpack> {
  const raw = await readFile(path, 'utf8');
  const pack = JSON.parse(raw) as Testpack;

  const byCat = new Map<string, Task[]>();
  for (const t of pack.tasks) {
    if (!byCat.has(t.category)) byCat.set(t.category, []);
    byCat.get(t.category)!.push(t);
  }

  const selected: Task[] = [];
  for (const tasks of byCat.values()) {
    const ranked = [...tasks].sort((a, b) => rank(seed, a.id).localeCompare(rank(seed, b.id)));
    selected.push(...ranked.slice(0, Math.min(perCategory, ranked.length)));
  }
  selected.sort((a, b) => a.id.localeCompare(b.id));

  return { version: `${pack.version}+holdout.${seed}`, tasks: selected };
}
