// Bundle the PUBLIC benchmark files into dist/ so the published npm package can
// run the local testpack. Only the public task set + taxonomy are copied — the
// private held-out pool (benchmarks/.holdout/) is never touched, so it can never
// reach npm. Runs from cli/ as part of prepublishOnly (after the tsc build).
import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '..', '..', 'benchmarks');
const OUT = resolve(import.meta.dirname, '..', 'dist', 'benchmarks');

mkdirSync(OUT, { recursive: true });
for (const file of ['tasks-v3.json', 'taxonomy.json']) {
  copyFileSync(resolve(SRC, file), resolve(OUT, file));
  console.log(`bundled ${file} -> dist/benchmarks/`);
}
