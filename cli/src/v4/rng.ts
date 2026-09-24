import { createHash } from 'node:crypto';
import type { Rng } from './types.js';

// mulberry32, seeded per task from sha256(seed|taskId) so adding or reordering
// tasks never shifts the values another task draws.
export function taskRng(seed: string, taskId: string): Rng {
  let a = createHash('sha256').update(`${seed}|${taskId}`).digest().readUInt32LE(0);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    pick: (xs) => xs[int(0, xs.length - 1)],
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export function newSeed(): string {
  return createHash('sha256').update(`${Date.now()}|${Math.random()}`).digest('hex').slice(0, 12);
}
