import type { V4Task } from '../types.js';
import { extractCode, pyLiteral } from '../util.js';

// Hidden tests are generated per run from the seed and checked against a
// reference implementation, so the expected outputs never appear in the repo.

type Interval = [number, number];

function mergeRef(xs: Interval[], gap: number): Interval[] {
  const s = [...xs].map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as Interval).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const out: Interval[] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a - last[1] <= gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export const codeMergeIntervals: V4Task = {
  id: 'code-merge-gap-1',
  suite: 'code',
  difficulty: 2,
  build(rng) {
    const cases: Array<{ xs: Interval[]; gap: number }> = [
      { xs: [], gap: 0 },
      { xs: [[5, 1]], gap: 0 },
      // Boundaries: distance exactly equal to gap merges; one more does not.
      { xs: [[4, 6], [0, 2]], gap: 2 },
      { xs: [[0, 1], [3, 4]], gap: 1 },
      { xs: [[1, 3], [3, 5]], gap: 0 },
      { xs: [[0, 10], [2, 3], [12, 12]], gap: 2 },
    ];
    for (let i = 0; i < 10; i++) {
      const n = rng.int(1, 9);
      const xs: Interval[] = [];
      for (let j = 0; j < n; j++) {
        const a = rng.int(-20, 40);
        xs.push(rng.next() < 0.15 ? [a + rng.int(0, 6), a] : [a, a + rng.int(0, 8)]);
      }
      cases.push({ xs, gap: rng.int(0, 3) });
    }
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          'Write a Python function `merge_close(intervals, gap)`.\n' +
          '- `intervals` is a list of [start, end] integer pairs. A pair may be reversed (start > end); treat it as [min, max].\n' +
          '- Merge intervals that overlap OR whose distance is at most `gap` (distance between [a,b] and [c,d] with c >= a is c - b).\n' +
          '- Return a new list of [start, end] lists sorted by start. Do not modify the input. An empty input returns [].\n' +
          'Return only the code in one ```python block.',
      }],
      async grade(res, ctx) {
        const code = extractCode(res.text);
        const probes = cases.map((c, i) =>
          `try:\n    _inp = ${pyLiteral(c.xs)}\n    _cp = [list(p) for p in _inp]\n    _r = merge_close(_inp, ${c.gap})\n    print("R${i}=" + json.dumps({"out": [list(p) for p in _r], "mutated": _inp != _cp}))\nexcept Exception as e:\n    print("R${i}=ERR " + type(e).__name__)`,
        ).join('\n');
        const run = await ctx.sandbox.run({ image: 'python', files: { 'main.py': `import json\n${code}\n\n${probes}\n` }, cmd: ['python', 'main.py'] });
        let ok = 0;
        const fails: string[] = [];
        cases.forEach((c, i) => {
          const m = run.stdout.match(new RegExp(`R${i}=(.*)`));
          const want = JSON.stringify(mergeRef(c.xs, c.gap));
          let pass = false;
          if (m && !m[1].startsWith('ERR')) {
            try {
              const got = JSON.parse(m[1]);
              pass = JSON.stringify(got.out) === want && !got.mutated;
            } catch { /* not JSON */ }
          }
          if (pass) ok++;
          else if (fails.length < 2) fails.push(`${JSON.stringify(c.xs)} gap=${c.gap}: want ${want}, got ${m?.[1] ?? 'nothing'}`);
        });
        return { score: ok / cases.length, detail: `${ok}/${cases.length} hidden tests${fails.length ? ' | ' + fails.join(' | ') : ''}${run.timedOut ? ' | timed out' : ''}` };
      },
    };
  },
};
