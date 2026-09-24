import type { Rng, V4Task } from '../types.js';
import { canon, extractCode, pyLiteral } from '../util.js';

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

// ── generic function-task harness ─────────────────────────────────────────────
// Each spec draws its hidden cases from the seed, computes the expected result
// with a TypeScript reference, and runs the model's code once in the sandbox
// over all cases. Results are compared as canonical JSON; a raised error is
// compared by its type name.

type Expect = { ok: unknown } | { err: string };
const ok = (v: unknown): Expect => ({ ok: v });
const err = (name: string): Expect => ({ err: name });

interface FnSpec {
  id: string;
  lang: 'python' | 'node';
  difficulty: 1 | 2 | 3;
  prompt: string;
  fn: string;
  driver?: string; // defines _drive(...args); default calls fn(*args)
  forbid?: { re: RegExp; why: string };
  cases(rng: Rng): unknown[][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref(...args: any[]): Expect;
}

function pyHarness(code: string, s: FnSpec): string {
  const driver = s.driver ?? `def _drive(*_a):\n    return ${s.fn}(*_a)\n`;
  return (
    `import json as _json\n${code}\n\n${driver}\n` +
    `_cases = _json.load(open('cases.json'))\n` +
    `for _i, _a in enumerate(_cases):\n` +
    `    try:\n        _r = _drive(*_a)\n        _line = _json.dumps({"ok": _r})\n` +
    `    except BaseException as _e:\n        _line = _json.dumps({"err": type(_e).__name__})\n` +
    `    print("R%d=" % _i + _line, flush=True)\n`
  );
}

function jsHarness(code: string, s: FnSpec): string {
  // Run as CommonJS; tolerate `export` keywords a model may add.
  const body = code.replace(/^\s*export\s+default\s+/gm, '').replace(/^(\s*)export\s+/gm, '$1');
  const driver = s.driver ?? `function _drive(..._a) { return ${s.fn}(..._a); }`;
  return (
    `${body}\n;\n${driver}\n` +
    `const _cases = JSON.parse(require('fs').readFileSync('cases.json', 'utf8'));\n` +
    `for (let _i = 0; _i < _cases.length; _i++) {\n` +
    `  let _line;\n` +
    `  try { const _r = _drive(..._cases[_i]); _line = JSON.stringify({ ok: _r === undefined ? null : _r }); }\n` +
    `  catch (_e) { _line = JSON.stringify({ err: (_e && _e.name) || 'Error' }); }\n` +
    `  console.log('R' + _i + '=' + _line);\n` +
    `}\n`
  );
}

function fnTask(s: FnSpec): V4Task {
  return {
    id: s.id,
    suite: 'code',
    difficulty: s.difficulty,
    build(rng) {
      const cases = s.cases(rng);
      const want = cases.map((c) => s.ref(...(structuredClone(c) as unknown[])));
      const lang = s.lang === 'python' ? 'Python' : 'JavaScript';
      const fence = s.lang === 'python' ? 'python' : 'javascript';
      const extra = s.lang === 'node' ? ' Plain JavaScript for Node 22, no imports or require.' : ' Standard library only.';
      return {
        kind: 'single',
        messages: [{ role: 'user', content: `${s.prompt}\n\nWrite it in ${lang}.${extra} Return only the code in one \`\`\`${fence} block.` }],
        async grade(res, ctx) {
          const code = extractCode(res.text);
          if (s.forbid && s.forbid.re.test(code)) return { score: 0, detail: s.forbid.why };
          const files: Record<string, string> =
            s.lang === 'python'
              ? { 'main.py': pyHarness(code, s), 'cases.json': JSON.stringify(cases) }
              : { 'main.cjs': jsHarness(code, s), 'cases.json': JSON.stringify(cases) };
          const run = await ctx.sandbox.run({
            image: s.lang,
            files,
            cmd: s.lang === 'python' ? ['python', 'main.py'] : ['node', 'main.cjs'],
            timeoutMs: 20000,
          });
          const got = new Map<number, string>();
          for (const line of run.stdout.split('\n')) {
            const m = /^R(\d+)=(.*)$/.exec(line);
            if (m && !got.has(Number(m[1]))) got.set(Number(m[1]), m[2]);
          }
          let pass = 0;
          const fails: string[] = [];
          want.forEach((w, i) => {
            const raw = got.get(i);
            let same = false;
            if (raw !== undefined) {
              try { same = canon(JSON.parse(raw)) === canon(w); } catch { /* bad output */ }
            }
            if (same) pass++;
            else if (fails.length < 2) fails.push(`case ${i}: want ${canon(w).slice(0, 80)}, got ${(raw ?? 'nothing').slice(0, 80)}`);
          });
          const tail = run.timedOut ? ' | timed out' : raw0(run.stdout, run.stderr);
          return { score: pass / want.length, detail: `${pass}/${want.length} hidden tests${fails.length ? ' | ' + fails.join(' | ') : ''}${tail}` };
        },
      };
    },
  };
}

function raw0(stdout: string, stderr: string): string {
  return stdout.trim() ? '' : stderr.trim() ? ` | ${stderr.trim().split('\n').slice(-1)[0].slice(0, 100)}` : '';
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const DAY = 86400000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parseDay = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const letters = (rng: Rng, alpha: string, lo: number, hi: number) =>
  Array.from({ length: rng.int(lo, hi) }, () => alpha[rng.int(0, alpha.length - 1)]).join('');

// ── Python tasks ──────────────────────────────────────────────────────────────

const DUR_MULT: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
function durationRef(s: string): Expect {
  const t = s.replace(/^ +| +$/g, '');
  if (!t) return err('ValueError');
  let pos = 0;
  let last = -1;
  let total = 0;
  while (pos < t.length) {
    while (t[pos] === ' ') pos++;
    const m = /^([0-9]+)([dhms])/.exec(t.slice(pos));
    if (!m) return err('ValueError');
    const u = 'dhms'.indexOf(m[2]);
    if (u <= last) return err('ValueError');
    last = u;
    total += Number(m[1]) * DUR_MULT[m[2]];
    pos += m[0].length;
  }
  return ok(total);
}

const parseDuration = fnTask({
  id: 'code-parse-duration-1',
  lang: 'python',
  difficulty: 2,
  fn: 'parse_duration',
  prompt:
    'Write `parse_duration(s)` that returns the total number of seconds (an int) in a duration string.\n' +
    '- A duration is one or more components, each a NUMBER immediately followed by a UNIT.\n' +
    "- Units: 'd' = 86400, 'h' = 3600, 'm' = 60, 's' = 1 seconds. Lowercase only.\n" +
    '- NUMBER is one or more ASCII digits (leading zeros allowed, no sign, no decimal point).\n' +
    '- Components must appear in strictly descending unit order (d, then h, then m, then s), each unit at most once.\n' +
    '- Space characters are allowed before, after and between components (including none between them), but never between a number and its unit. No other whitespace is allowed.\n' +
    '- Raise ValueError for anything else, including an empty or all-space string.\n' +
    "Examples: '1h 30m' -> 5400, '2d4h' -> 187200, ' 45s ' -> 45.",
  cases(rng) {
    const fixed = ['0s', '007s', '1d 0h', '', '   ', '1h 30', '30m1h', '1h1h', '1H', '1.5h', '-5m', '1 h', 'h', '5x', '1h\t30m', '10s5', '1d2h3m4s5s'];
    const out: unknown[][] = fixed.map((f) => [f]);
    for (let i = 0; i < 14; i++) {
      const parts = ['d', 'h', 'm', 's'].filter(() => rng.next() < 0.55);
      if (!parts.length) parts.push(rng.pick(['d', 'h', 'm', 's']));
      const seps = ['', ' ', '  '];
      const body = parts.map((u) => `${rng.next() < 0.15 ? '0' : ''}${rng.int(0, 99)}${u}`).join(rng.pick(seps));
      out.push([`${rng.pick(['', ' '])}${body}${rng.pick(['', ' '])}`]);
    }
    return out;
  },
  ref: durationRef,
});

function addBizRef(date: string, n: number, holidays: string[]): Expect {
  if (n === 0) return ok(date);
  const hol = new Set(holidays);
  let d = parseDay(date);
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step * DAY;
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6 && !hol.has(isoDay(d))) left--;
  }
  return ok(isoDay(d));
}

const businessDays = fnTask({
  id: 'code-business-days-1',
  lang: 'python',
  difficulty: 3,
  fn: 'add_business_days',
  prompt:
    'Write `add_business_days(date_str, n, holidays)`.\n' +
    "- `date_str` is 'YYYY-MM-DD'; `holidays` is a list of 'YYYY-MM-DD' strings; `n` is an int (may be negative).\n" +
    '- A business day is a Monday–Friday that is not in `holidays`.\n' +
    '- If n > 0, step forward one calendar day at a time, counting each business day you land on, until you have counted n; return that date. If n < 0, do the same backwards. The start date itself is never counted.\n' +
    '- If n == 0, return `date_str` unchanged, even if it is not a business day.\n' +
    "- Return the result as 'YYYY-MM-DD'.",
  cases(rng) {
    const out: unknown[][] = [
      ['2026-09-25', 1, []], ['2026-09-26', 1, []], ['2026-09-26', -1, []], ['2026-09-27', 0, []],
      ['2026-09-25', 1, ['2026-09-28']], ['2024-02-28', 1, []], ['2026-12-31', 1, ['2027-01-01']],
      ['2027-01-04', -1, ['2027-01-01']], ['2026-09-28', -5, ['2026-09-23']],
    ];
    for (let i = 0; i < 12; i++) {
      const base = Date.UTC(2024, 0, 1) + rng.int(0, 1200) * DAY;
      const hol = Array.from({ length: rng.int(0, 4) }, () => isoDay(base + rng.int(-20, 20) * DAY));
      out.push([isoDay(base), rng.int(-15, 15), hol]);
    }
    return out;
  },
  ref: addBizRef,
});

function osaRef(a: string, b: string): Expect {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return ok(d[a.length][b.length]);
}

const editCost = fnTask({
  id: 'code-edit-cost-osa-1',
  lang: 'python',
  difficulty: 3,
  fn: 'min_cost',
  prompt:
    'Write `min_cost(a, b)` returning the minimum total cost to turn string `a` into string `b` using these operations:\n' +
    '- insert one character: cost 1\n' +
    '- delete one character: cost 1\n' +
    '- replace one character with a different character: cost 2\n' +
    '- swap two adjacent characters: cost 1\n' +
    'Use the "optimal string alignment" restriction: once two characters have been swapped, neither may be edited again, and no substring is edited more than once.\n' +
    "Example: min_cost('ab', 'ba') == 1, min_cost('a', 'b') == 2.",
  cases(rng) {
    const out: unknown[][] = [['', ''], ['abc', ''], ['', 'ab'], ['ab', 'ba'], ['ca', 'abc'], ['abcd', 'badc'], ['aab', 'aba']];
    for (let i = 0; i < 14; i++) {
      const a = letters(rng, 'abcd', 0, 8);
      let b = a.split('');
      for (let k = rng.int(0, 3); k > 0; k--) {
        const op = rng.int(0, 3);
        const p = rng.int(0, Math.max(0, b.length - 1));
        if (op === 0) b.splice(p, 0, rng.pick(['a', 'b', 'c', 'd']));
        else if (op === 1 && b.length) b.splice(p, 1);
        else if (op === 2 && b.length) b[p] = rng.pick(['a', 'b', 'c', 'd']);
        else if (b.length > 1 && p < b.length - 1) [b[p], b[p + 1]] = [b[p + 1], b[p]];
      }
      if (rng.next() < 0.2) b = letters(rng, 'abcd', 0, 8).split('');
      out.push([a, b.join('')]);
    }
    return out;
  },
  ref: osaRef,
});

function evalRef(expr: string): Expect {
  const toks: Array<string | number> = [];
  for (let i = 0; i < expr.length;) {
    const c = expr[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9]/.test(expr[j])) j++;
      toks.push(Number(expr.slice(i, j)));
      i = j;
      continue;
    }
    toks.push(c);
    i++;
  }
  let p = 0;
  const peek = () => toks[p];
  const expr_ = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = toks[p++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (peek() === '*' || peek() === '/') {
      const op = toks[p++];
      const r = unary();
      if (op === '*') v = v * r;
      else {
        if (r === 0) throw new Error('ZeroDivisionError');
        v = Math.trunc(v / r);
      }
    }
    return v;
  };
  const unary = (): number => {
    if (peek() === '-') { p++; return -unary(); }
    const t = toks[p++];
    if (t === '(') { const v = expr_(); p++; return v; }
    return t as number;
  };
  try {
    return ok(expr_() + 0);
  } catch {
    return err('ZeroDivisionError');
  }
}

function genExpr(rng: Rng, depth: number): string {
  const sp = () => (rng.next() < 0.3 ? ' ' : '');
  const factor = (d: number): string => {
    const neg = rng.next() < 0.2 ? '-' : '';
    if (d > 0 && rng.next() < 0.3) return `${neg}(${sp()}${expr(d - 1)}${sp()})`;
    return `${neg}${rng.int(0, 20)}`;
  };
  const term = (d: number): string => {
    let s = factor(d);
    for (let k = rng.int(0, 2); k > 0; k--) s += `${sp()}${rng.pick(['*', '/', '/'])}${sp()}${factor(d)}`;
    return s;
  };
  const expr = (d: number): string => {
    let s = term(d);
    for (let k = rng.int(0, 2); k > 0; k--) s += `${sp()}${rng.pick(['+', '-'])}${sp()}${term(d)}`;
    return s;
  };
  return expr(depth);
}

const evaluate = fnTask({
  id: 'code-eval-trunc-div-1',
  lang: 'python',
  difficulty: 3,
  fn: 'evaluate',
  forbid: { re: /\b(eval|exec|compile)\s*\(/, why: 'used eval/exec/compile, which the task forbids' },
  prompt:
    'Write `evaluate(expr)` that computes an integer arithmetic expression given as a string and returns an int.\n' +
    '- Tokens: non-negative integer literals, + - * / and parentheses. Spaces may appear between any tokens.\n' +
    "- Unary minus is allowed anywhere a number or parenthesis may start, and may repeat: '-3', '-(2+1)', '2*-3', '--3'.\n" +
    '- Precedence: unary minus binds tightest, then * and /, then + and -. Binary operators are left-associative.\n' +
    '- `/` is integer division that truncates toward zero: 7/-2 == -3 and -7/2 == -3.\n' +
    '- Division by zero raises ZeroDivisionError.\n' +
    '- Do not use eval, exec or compile.',
  cases(rng) {
    const out: unknown[][] = ['7/-2', '-7/2', '2*-3', '--3', '2-3-4', '100/10/3', '2+3*4', '(2+3)*4', ' 8 / 3 ', '1/0', '5/(2-2)', '-(4-10)/4'].map((e) => [e]);
    for (let i = 0; i < 14; i++) out.push([genExpr(rng, 2)]);
    return out;
  },
  ref: evalRef,
});

function rleEncode(s: string): string {
  let out = '';
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    out += (j - i > 1 ? String(j - i) : '') + s[i];
    i = j;
  }
  return out;
}
function rleRef(op: string, arg: string): Expect {
  if (op === 'enc') return ok(rleEncode(arg));
  if (!/^(?:[0-9]*[a-z])*$/.test(arg)) return err('ValueError');
  let s = '';
  for (const m of arg.matchAll(/([0-9]*)([a-z])/g)) s += m[2].repeat(m[1] ? Number(m[1]) : 1);
  return rleEncode(s) === arg ? ok(s) : err('ValueError');
}
const runs = (rng: Rng) => Array.from({ length: rng.int(0, 6) }, () => rng.pick(['a', 'b', 'c', 'z']).repeat(rng.int(1, 13))).join('');

const rle = fnTask({
  id: 'code-rle-canonical-1',
  lang: 'python',
  difficulty: 3,
  fn: 'rle_encode',
  driver: "def _drive(op, arg):\n    return rle_encode(arg) if op == 'enc' else rle_decode(arg)\n",
  prompt:
    'Write two functions.\n' +
    '`rle_encode(s)`: `s` contains only lowercase letters a-z. Replace each maximal run of one repeated letter by the run length (in decimal) followed by the letter, but write just the letter when the run length is 1. Example: \'aaabccdddd\' -> \'3ab2c4d\'. Empty string -> empty string.\n' +
    '`rle_decode(t)`: the exact inverse. It must accept only strings that `rle_encode` could have produced for some input, and raise ValueError for anything else (for example an explicit count of 0 or 1, a leading zero, a count with no letter after it, a letter run that should have been merged such as \'2a2a\' or \'aa\', or any character other than digits and lowercase letters).',
  cases(rng) {
    const out: unknown[][] = [['enc', ''], ['dec', ''], ['enc', 'a'.repeat(12) + 'b'], ['dec', '12ab']];
    for (const bad of ['1a', '0a', '02a', '2a2a', 'aa', '3', 'a3', 'A', '2a-', '12', 'b1']) out.push(['dec', bad]);
    for (let i = 0; i < 6; i++) out.push(['enc', runs(rng)]);
    for (let i = 0; i < 6; i++) out.push(['dec', rleEncode(runs(rng))]);
    return out;
  },
  ref: rleRef,
});

function topKRef(text: string, k: number): Expect {
  const counts = new Map<string, number>();
  for (const raw of text.match(/[A-Za-z']+/g) ?? []) {
    const w = raw.toLowerCase().replace(/^'+|'+$/g, '');
    if (!w) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const order = [...counts.keys()];
  const sorted = [...order].sort((x, y) => counts.get(y)! - counts.get(x)! || order.indexOf(x) - order.indexOf(y));
  return ok(sorted.slice(0, k).map((w) => [w, counts.get(w)!]));
}

const topK = fnTask({
  id: 'code-top-k-words-1',
  lang: 'python',
  difficulty: 2,
  fn: 'top_k_words',
  prompt:
    'Write `top_k_words(text, k)`.\n' +
    "- A word is a maximal run of ASCII letters and apostrophes (A-Z, a-z, '). Lowercase it, then strip apostrophes from both ends; if nothing is left, ignore it.\n" +
    '- Return the k most frequent words as a list of [word, count] lists, most frequent first.\n' +
    '- Break ties by which word first appeared earlier in the text (NOT alphabetically).\n' +
    '- If there are fewer than k distinct words, return all of them.',
  cases(rng) {
    const out: unknown[][] = [['', 3], ["''' ''", 2], ['b a c b a', 5], ["Don't stop, don't! 'Quoted' quoted rock'n'roll", 3]];
    const vocab = ['zeta', 'alpha', "don't", "'tis", 'Rock', 'rock', "rock'n'roll", 'mid', 'Beta', 'beta'];
    const punct = [' ', ', ', '. ', '! ', ' -- ', '\n', ' (', ') ', ' "', '" '];
    for (let i = 0; i < 10; i++) {
      let t = '';
      for (let j = rng.int(3, 25); j > 0; j--) t += rng.pick(vocab) + rng.pick(punct);
      out.push([t, rng.int(1, 6)]);
    }
    return out;
  },
  ref: topKRef,
});

function spiralRef(m: number[][]): Expect {
  const out: number[] = [];
  if (!m.length || !m[0].length) return ok(out);
  let top = 0, bottom = m.length - 1, left = 0, right = m[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let j = left; j <= right; j++) out.push(m[top][j]);
    top++;
    for (let i = top; i <= bottom; i++) out.push(m[i][right]);
    right--;
    if (top <= bottom) { for (let j = right; j >= left; j--) out.push(m[bottom][j]); bottom--; }
    if (left <= right) { for (let i = bottom; i >= top; i--) out.push(m[i][left]); left++; }
  }
  return ok(out);
}

const spiral = fnTask({
  id: 'code-spiral-1',
  lang: 'python',
  difficulty: 1,
  fn: 'spiral',
  prompt:
    'Write `spiral(matrix)`: `matrix` is a list of rows (all rows the same length; there may be zero rows, or rows of length zero). Return all elements in clockwise spiral order starting at the top-left corner, as a flat list.',
  cases(rng) {
    let n = 1;
    const mk = (r: number, c: number) => Array.from({ length: r }, () => Array.from({ length: c }, () => n++));
    const out: unknown[][] = [[[]], [[[], []]], [mk(1, 4)], [mk(4, 1)], [mk(3, 4)], [mk(4, 3)], [mk(3, 3)]];
    for (let i = 0; i < 6; i++) out.push([mk(rng.int(1, 6), rng.int(1, 6))]);
    return out;
  },
  ref: spiralRef,
});

function csvRef(text: string): Expect {
  if (text === '') return ok([]);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false, afterQ = false, atStart = true, endedNl = false;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    endedNl = false;
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; afterQ = true; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') {
      if (atStart) { inQ = true; atStart = false; i++; continue; }
      return err('ValueError');
    }
    if (c === ',') { row.push(field); field = ''; afterQ = false; atStart = true; i++; continue; }
    if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      row.push(field); rows.push(row); row = []; field = '';
      afterQ = false; atStart = true; endedNl = true;
      i += c === '\r' ? 2 : 1;
      continue;
    }
    if (afterQ) return err('ValueError');
    field += c; atStart = false; i++;
  }
  if (inQ) return err('ValueError');
  if (!endedNl) { row.push(field); rows.push(row); }
  return ok(rows);
}

function genCsv(rng: Rng): string {
  const nl = rng.pick(['\n', '\r\n']);
  const rows = Array.from({ length: rng.int(1, 4) }, () =>
    Array.from({ length: rng.int(1, 4) }, () => {
      const v = letters(rng, 'ab ,"\nxy', 0, 5);
      const needs = /[,"\n]/.test(v) || rng.next() < 0.25;
      return needs ? `"${v.replace(/"/g, '""')}"` : v.replace(/[,"\n]/g, '');
    }).join(','),
  );
  return rows.join(nl) + (rng.next() < 0.5 ? nl : '');
}

const csv = fnTask({
  id: 'code-csv-parse-1',
  lang: 'python',
  difficulty: 3,
  fn: 'parse_csv',
  forbid: { re: /\bimport\s+csv\b|\bfrom\s+csv\s+import\b/, why: 'imported the csv module, which the task forbids' },
  prompt:
    'Write `parse_csv(text)` that parses CSV text into a list of rows (each a list of strings), without using the csv module.\n' +
    "- Rows end at '\\n' or '\\r\\n'. A lone '\\r' is ordinary data. A line terminator at the very end of the text does not start another row. Empty text returns []. An empty line is a row with one empty field [''].\n" +
    '- Fields are separated by commas.\n' +
    '- A field that starts with a double quote is quoted: it runs to the matching closing quote and may contain commas, quotes written as two double quotes (""), and line terminators. The closing quote must be followed by a comma, a line terminator or the end of the text.\n' +
    '- A double quote anywhere else (inside an unquoted field, or after a closing quote) is an error, as is an unterminated quoted field. Raise ValueError for errors.',
  cases(rng) {
    const out: unknown[][] = ['', '\n', 'a\n\nb', 'a,b\r\n', '"a""b",c', '"x\ny",z\n', '"",', '"ab"c', 'ab"c', '"open', 'a,b\rc', '"a"\n"b"'].map((t) => [t]);
    for (let i = 0; i < 10; i++) out.push([genCsv(rng)]);
    return out;
  },
  ref: csvRef,
});

function lruRef(cap: number, ops: Array<[string, number, number?]>): Expect {
  const m = new Map<number, number>();
  const out: Array<number | null> = [];
  for (const [op, k, v] of ops) {
    if (op === 'get') {
      if (!m.has(k)) { out.push(-1); continue; }
      const val = m.get(k)!;
      m.delete(k); m.set(k, val); out.push(val);
    } else {
      out.push(null);
      if (cap <= 0) continue;
      m.delete(k); m.set(k, v!);
      if (m.size > cap) m.delete(m.keys().next().value!);
    }
  }
  return ok(out);
}

const lru = fnTask({
  id: 'code-lru-cache-1',
  lang: 'python',
  difficulty: 2,
  fn: 'LRUCache',
  driver:
    'def _drive(cap, ops):\n    c = LRUCache(cap)\n    out = []\n    for op in ops:\n' +
    "        if op[0] == 'get':\n            out.append(c.get(op[1]))\n        else:\n            out.append(c.put(op[1], op[2]))\n    return out\n",
  prompt:
    'Write a class `LRUCache`.\n' +
    '- `LRUCache(capacity)` with capacity >= 0.\n' +
    '- `get(key)` returns the stored value, or -1 if absent. A successful get makes the key the most recently used.\n' +
    '- `put(key, value)` inserts or updates the key and makes it the most recently used; it returns None. If inserting a new key makes the cache hold more than `capacity` keys, first evict the least recently used key. With capacity 0 nothing is ever stored.',
  cases(rng) {
    const out: unknown[][] = [
      [0, [['put', 1, 1], ['get', 1]]],
      [2, [['put', 1, 1], ['put', 2, 2], ['put', 1, 10], ['put', 3, 3], ['get', 1], ['get', 2], ['get', 3]]],
      [2, [['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2], ['get', 1]]],
    ];
    for (let i = 0; i < 6; i++) {
      const ops = Array.from({ length: rng.int(10, 30) }, () =>
        rng.next() < 0.5 ? ['get', rng.int(0, 5)] : ['put', rng.int(0, 5), rng.int(0, 99)]);
      out.push([rng.int(1, 4), ops]);
    }
    return out;
  },
  ref: lruRef,
});

function weightRef(jobs: Array<[number, number, number]>): Expect {
  const js = [...jobs].sort((a, b) => a[1] - b[1]);
  const dp = Array(js.length + 1).fill(0);
  for (let i = 1; i <= js.length; i++) {
    const [s, , w] = js[i - 1];
    let k = 0;
    for (let j = i - 1; j >= 1; j--) if (js[j - 1][1] <= s) { k = j; break; }
    dp[i] = Math.max(dp[i - 1], w + dp[k]);
  }
  return ok(dp[js.length]);
}

const maxWeight = fnTask({
  id: 'code-weighted-schedule-1',
  lang: 'python',
  difficulty: 2,
  fn: 'max_weight',
  prompt:
    'Write `max_weight(jobs)`: `jobs` is a list of [start, end, weight] integer lists with start < end and weight > 0. Choose a set of jobs that do not overlap, maximising the total weight, and return that total (0 if there are no jobs). Two jobs are compatible when one ends at or before the moment the other starts (a job ending at 5 and one starting at 5 are compatible). There can be up to 200 jobs.',
  cases(rng) {
    const out: unknown[][] = [[[]], [[[1, 3, 5], [3, 5, 5]]], [[[1, 4, 5], [3, 5, 5]]], [[[0, 10, 7], [0, 5, 4], [5, 10, 4]]]];
    for (let i = 0; i < 8; i++) {
      out.push([Array.from({ length: rng.int(1, 12) }, () => {
        const s = rng.int(0, 20);
        return [s, s + rng.int(1, 6), rng.int(1, 20)];
      })]);
    }
    return out;
  },
  ref: weightRef,
});

const ROMAN: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
function romanRef(op: string, arg: unknown): Expect {
  if (op === 'to') {
    const n = arg as number;
    return Number.isInteger(n) && n >= 1 && n <= 3999 ? ok(toRoman(n)) : err('ValueError');
  }
  const s = arg as string;
  if (!/^[MDCLXVI]+$/.test(s)) return err('ValueError');
  let i = 0;
  let total = 0;
  for (const [v, sym] of ROMAN) while (s.startsWith(sym, i)) { total += v; i += sym.length; }
  return i === s.length && total >= 1 && total <= 3999 && toRoman(total) === s ? ok(total) : err('ValueError');
}

const roman = fnTask({
  id: 'code-roman-strict-1',
  lang: 'python',
  difficulty: 2,
  fn: 'to_roman',
  driver: "def _drive(op, arg):\n    return to_roman(arg) if op == 'to' else from_roman(arg)\n",
  prompt:
    'Write two functions.\n' +
    '`to_roman(n)`: for an int 1 <= n <= 3999 return the standard Roman numeral (uppercase; subtractive pairs IV, IX, XL, XC, CD, CM only). Raise ValueError for any other n.\n' +
    '`from_roman(s)`: the inverse. Accept ONLY the exact string `to_roman` would produce; raise ValueError for anything else, e.g. \'IIII\', \'IM\', \'VX\', \'IIV\', \'MMMM\', \'iv\' or \'\'.',
  cases(rng) {
    const out: unknown[][] = [['to', 0], ['to', 4000], ['to', -1], ['to', 3999], ['to', 4], ['from', 'MMMCMXCIX'], ['from', 'XLIV']];
    for (const bad of ['IIII', 'IM', 'VX', 'IIV', 'MMMM', 'iv', '', 'XIIII', 'CMCM', 'IVI', 'VV']) out.push(['from', bad]);
    for (let i = 0; i < 6; i++) out.push(['to', rng.int(1, 3999)]);
    for (let i = 0; i < 6; i++) out.push(['from', toRoman(rng.int(1, 3999))]);
    return out;
  },
  ref: romanRef,
});

function versionKey(v: string): { nums: number[]; pre: string | null } {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z]+))?$/.exec(v)!;
  return { nums: [m[1], m[2], m[3]].map((x) => (x ? Number(x) : 0)), pre: m[4] ?? null };
}
function cmpVersion(a: string, b: string): number {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const dx = /^\d+$/.test(x.pre), dy = /^\d+$/.test(y.pre);
  if (dx && dy) return Number(x.pre) - Number(y.pre);
  if (dx !== dy) return dx ? -1 : 1;
  return x.pre < y.pre ? -1 : x.pre > y.pre ? 1 : 0;
}

const versions = fnTask({
  id: 'code-version-sort-1',
  lang: 'python',
  difficulty: 2,
  fn: 'sort_versions',
  prompt:
    'Write `sort_versions(versions)` returning a new list of version strings in ascending order.\n' +
    "- Each version is MAJOR[.MINOR[.PATCH]][-PRE]: MAJOR, MINOR, PATCH are non-negative decimal integers; PRE is a non-empty run of ASCII letters and digits. A missing MINOR or PATCH counts as 0, so '1.2' equals '1.2.0'.\n" +
    '- Compare (MAJOR, MINOR, PATCH) numerically. If equal, a version with PRE comes before the same version without PRE.\n' +
    '- Two PREs: if both are all digits compare them as numbers; an all-digit PRE comes before one containing a letter; otherwise compare by plain character-code order (so uppercase sorts before lowercase).\n' +
    '- Versions that compare equal keep their original relative order.',
  cases(rng) {
    const out: unknown[][] = [[[]], [['1.10.0', '1.9.0', '1.2', '1.2.0', '1.2.0-rc1', '1.2.0-2', '1.2.0-10', '1.2.0-RC1', '1.2.0-alpha']]];
    const pres = [null, null, null, 'alpha', 'beta', 'rc1', 'rc10', 'rc2', '2', '10', 'RC1'];
    for (let i = 0; i < 6; i++) {
      out.push([Array.from({ length: rng.int(2, 10) }, () => {
        const parts = [rng.int(0, 12), rng.int(0, 12), rng.int(0, 12)].slice(0, rng.int(1, 3));
        const pre = rng.pick(pres);
        return parts.join('.') + (pre ? `-${pre}` : '');
      })]);
    }
    return out;
  },
  ref: (vs: string[]) => ok([...vs].sort(cmpVersion)),
});

function flattenRef(obj: Record<string, unknown>, sep: string): Expect {
  const out: Array<[string, unknown]> = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v) && v.length) v.forEach((x, i) => walk(x, `${path}${sep}${i}`));
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}${sep}${k}`);
    } else out.push([path, v]);
  };
  for (const [k, v] of Object.entries(obj)) walk(v, k);
  return ok(out);
}

function genJson(rng: Rng, depth: number): unknown {
  const r = rng.next();
  if (depth <= 0 || r < 0.35) return rng.pick([1, 0, -3, 2.5, 'x', '', true, false, null]);
  if (r < 0.45) return rng.pick([{}, []]);
  if (r < 0.7) return Array.from({ length: rng.int(1, 3) }, () => genJson(rng, depth - 1));
  const o: Record<string, unknown> = {};
  for (const k of rng.shuffle(['a', 'bb', 'k', 'zeta', 'm_n']).slice(0, rng.int(1, 3))) o[k] = genJson(rng, depth - 1);
  return o;
}

const flatten = fnTask({
  id: 'code-flatten-paths-1',
  lang: 'python',
  difficulty: 2,
  fn: 'flatten',
  driver: 'def _drive(obj, sep):\n    return [[k, v] for k, v in flatten(obj, sep).items()]\n',
  prompt:
    "Write `flatten(obj, sep='.')`: `obj` is a dict of JSON-like values (dict, list, str, int, float, bool, None). Return a new dict mapping path strings to leaf values.\n" +
    '- A path joins dict keys and list indexes (written as decimal strings) with `sep`.\n' +
    '- Non-empty dicts and lists are descended into; everything else is a leaf. Empty dicts and empty lists are leaves and keep their value ({} or []).\n' +
    '- The result must list keys in depth-first order, following dict insertion order and list order.\n' +
    "Example: flatten({'a': {'b': [1, {}]}, 'c': []}) == {'a.b.0': 1, 'a.b.1': {}, 'c': []}.",
  cases(rng) {
    const out: unknown[][] = [[{}, '.'], [{ a: { b: [1, {}] }, c: [] }, '.'], [{ x: [[[]]] }, '/']];
    for (let i = 0; i < 7; i++) {
      const o: Record<string, unknown> = {};
      for (const k of rng.shuffle(['r', 'q', 'alpha', 'beta']).slice(0, rng.int(1, 4))) o[k] = genJson(rng, 3);
      out.push([o, rng.pick(['.', '/', '__'])]);
    }
    return out;
  },
  ref: flattenRef,
});

// ── JavaScript tasks ──────────────────────────────────────────────────────────

function groupRef(rows: Array<Record<string, unknown>>, keys: string[], field: string): Expect {
  const groups = new Map<string, Record<string, unknown>>();
  const out: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const id = JSON.stringify(keys.map((k) => (r[k] === undefined ? ['u'] : [typeof r[k], r[k]])));
    let g = groups.get(id);
    if (!g) {
      g = {};
      for (const k of keys) if (r[k] !== undefined) g[k] = r[k];
      g.total = 0;
      g.count = 0;
      groups.set(id, g);
      out.push(g);
    }
    g.total = (g.total as number) + (typeof r[field] === 'number' ? (r[field] as number) : 0);
    g.count = (g.count as number) + 1;
  }
  return ok(out);
}

const groupSum = fnTask({
  id: 'code-js-group-sum-1',
  lang: 'node',
  difficulty: 2,
  fn: 'groupSum',
  prompt:
    'Write `function groupSum(rows, keys, field)`.\n' +
    '- `rows` is an array of plain objects; `keys` is an array of property names; `field` is a property name.\n' +
    '- Group the rows by their values for all of `keys`, comparing values with === (so the number 1 and the string "1" are different, and null is different from a missing property; a missing property is its own group value).\n' +
    '- Return an array with one object per group, in order of each group\'s first row. Each object has the group\'s key properties (leave a key out when its group value is a missing property), plus `total`: the sum of `row[field]` over the group\'s rows, counting any non-number or missing value as 0, and `count`: the number of rows.',
  cases(rng) {
    const out: unknown[][] = [
      [[], ['region'], 'amount'],
      [[{ region: 1, amount: 2 }, { region: '1', amount: 3 }, { amount: 4 }, { region: null, amount: 5 }, { region: 1, amount: '7' }], ['region'], 'amount'],
    ];
    const vals = ['east', 'west', 1, '1', null, undefined];
    for (let i = 0; i < 6; i++) {
      const keys = rng.next() < 0.5 ? ['region'] : ['region', 'tier'];
      const rows = Array.from({ length: rng.int(1, 12) }, () => {
        const r: Record<string, unknown> = {};
        for (const k of ['region', 'tier']) { const v = rng.pick(vals); if (v !== undefined) r[k] = v; }
        const a = rng.pick([rng.int(-5, 50), rng.int(0, 9), '5', undefined]);
        if (a !== undefined) r.amount = a;
        return r;
      });
      out.push([rows, keys, 'amount']);
    }
    return out;
  },
  ref: groupRef,
});

function debounceRef(events: Array<[number, string]>, wait: number): Expect {
  const out: Array<[number, string]> = [];
  let p: [number, string] | null = null;
  for (const [t, v] of events) {
    if (p && p[0] <= t) { out.push(p); p = null; }
    p = [t + wait, v];
  }
  if (p) out.push(p);
  return ok(out);
}

const debounce = fnTask({
  id: 'code-js-debounce-sim-1',
  lang: 'node',
  difficulty: 2,
  fn: 'debounceEvents',
  prompt:
    'Write `function debounceEvents(events, wait)` that simulates a trailing-edge debounce.\n' +
    '- `events` is an array of [t, value] pairs with integer times t in non-decreasing order; `wait` is an integer >= 0.\n' +
    '- Each event cancels any pending timer and starts a new one that fires at time t + wait with that event\'s value.\n' +
    '- When a timer fires, emit [fireTime, value]. If a pending timer is due at exactly the same time as the next event arrives, the timer fires first.\n' +
    '- Return all emissions in order (the last pending timer always fires at the end).',
  cases(rng) {
    const out: unknown[][] = [[[], 5], [[[0, 'a'], [3, 'b']], 3], [[[0, 'a'], [3, 'b']], 4], [[[5, 'a'], [5, 'b']], 0], [[[1, 'a'], [1, 'b'], [2, 'c']], 1]];
    for (let i = 0; i < 8; i++) {
      let t = rng.int(0, 5);
      const ev = Array.from({ length: rng.int(1, 10) }, (_, j) => { t += rng.int(0, 6); return [t, `v${j}`]; });
      out.push([ev, rng.int(0, 6)]);
    }
    return out;
  },
  ref: debounceRef,
});

function deepEqualRef(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqualRef(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqualRef((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

function mutate(rng: Rng, v: unknown): unknown {
  if (Array.isArray(v)) {
    if (!v.length || rng.next() < 0.3) return [...v, 0];
    const c = [...v]; const i = rng.int(0, c.length - 1); c[i] = mutate(rng, c[i]); return c;
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    if (!ks.length) return [];
    const c: Record<string, unknown> = { ...(v as Record<string, unknown>) };
    const k = rng.pick(ks); c[k] = mutate(rng, c[k]); return c;
  }
  return rng.pick([v === 1 ? '1' : 1, v === null ? {} : null, v === false ? 0 : false, 'x' + String(v)]);
}

function reorder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reorder);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse()) o[k] = reorder((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

const deepEqual = fnTask({
  id: 'code-js-deep-equal-1',
  lang: 'node',
  difficulty: 1,
  fn: 'deepEqual',
  prompt:
    'Write `function deepEqual(a, b)` for JSON values (null, booleans, numbers, strings, arrays and plain objects). Arrays are equal when they have the same length and their elements are pairwise deep-equal. Objects are equal when they have exactly the same set of own keys (order does not matter) with deep-equal values. Everything else is compared with ===. An array never equals an object, and null equals only null. Return a boolean.',
  cases(rng) {
    const out: unknown[][] = [[[], {}], [null, {}], [{ a: 1, b: 2 }, { b: 2, a: 1 }], [[1, [2]], [1, [2]]], [{ a: 1 }, { a: 1, b: null }], [1, '1'], [0, false], [[], []], [{ a: [] }, { a: {} }]];
    for (let i = 0; i < 8; i++) {
      const v = { root: genJson(rng, 3), list: [genJson(rng, 2)] };
      out.push(rng.next() < 0.5 ? [v, reorder(v)] : [v, mutate(rng, v)]);
    }
    return out;
  },
  ref: (a: unknown, b: unknown) => ok(deepEqualRef(a, b)),
});

function qsDecode(s: string): string {
  s = s.replace(/\+/g, ' ');
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s[i] === '%' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      const bytes: number[] = [];
      while (s[i] === '%' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 3; }
      out += Buffer.from(bytes).toString('utf8');
    } else { out += s[i]; i++; }
  }
  return out;
}
function queryRef(qs: string): Expect {
  const out: Record<string, unknown> = {};
  for (const piece of qs.replace(/^\?/, '').split('&')) {
    if (!piece) continue;
    const eq = piece.indexOf('=');
    let k = qsDecode(eq < 0 ? piece : piece.slice(0, eq));
    const v = qsDecode(eq < 0 ? '' : piece.slice(eq + 1));
    let forced = false;
    if (k.endsWith('[]')) { k = k.slice(0, -2); forced = true; }
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      const cur = out[k];
      if (Array.isArray(cur)) cur.push(v); else out[k] = [cur, v];
    } else out[k] = forced ? [v] : v;
  }
  return ok(out);
}

const parseQuery = fnTask({
  id: 'code-js-parse-query-1',
  lang: 'node',
  difficulty: 3,
  fn: 'parseQuery',
  prompt:
    'Write `function parseQuery(qs)` that parses a URL query string into a plain object.\n' +
    "- Remove one leading '?' if present. Split on '&' and skip empty pieces.\n" +
    "- Split each piece at its FIRST '='; with no '=', the value is ''.\n" +
    "- Decode the key and the value the same way: first turn every '+' into a space, then decode percent-escapes %XX (hex digits, either case) as UTF-8 bytes. A '%' that is not followed by two hex digits is left exactly as written, and the rest of the string is still decoded.\n" +
    "- After decoding, if a key ends with '[]', remove that suffix and store the value in an array even if it is the only one.\n" +
    '- Pieces with the same (decoded, suffix-stripped) key share one entry: the second occurrence turns a single value into an array [first, second], and later ones append. Keys are case-sensitive.',
  cases(rng) {
    const out: unknown[][] = [
      [''], ['?'], ['?a=1&b=2'], ['a=1&a=2&a=3'], ['a[]=1'], ['a=1&a[]=2'], ['x&y=&=5'], ['q=a+b%2Bc'], ['k=%zz%41'], ['k=%4'], ['n=caf%C3%A9'],
      ['a=%7e%7E'], ['a=b=c'], ['A=1&a=2'], ['a%5B%5D=1'], ['&&a=1&&'],
    ];
    const keys = ['a', 'b', 'tag', 'x y', 'q'];
    const vals = ['1', 'hello+world', '%41', 'caf%C3%A9', '%zz', '', 'a%20b', '100%', 'x=y'];
    for (let i = 0; i < 6; i++) {
      const pieces = Array.from({ length: rng.int(1, 6) }, () => {
        let k = rng.pick(keys).replace(' ', rng.pick(['+', '%20']));
        if (rng.next() < 0.2) k += '[]';
        return rng.next() < 0.1 ? k : `${k}=${rng.pick(vals)}`;
      });
      out.push([(rng.next() < 0.3 ? '?' : '') + pieces.join('&')]);
    }
    return out;
  },
  ref: queryRef,
});

function addMonths(d: string, m: number): string {
  const y = Number(d.slice(0, 4)), mo = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  const total = y * 12 + (mo - 1) + m;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad2(nm)}-${pad2(Math.min(day, last))}`;
}
function monthsRef(a: string, b: string): Expect {
  const mb = (x: string, y: string): number => {
    if (y < x) return -mb(y, x);
    let m = 0;
    while (addMonths(x, m + 1) <= y) m++;
    return m;
  };
  return ok(mb(a, b) + 0);
}

const monthsBetween = fnTask({
  id: 'code-js-months-between-1',
  lang: 'node',
  difficulty: 3,
  fn: 'monthsBetween',
  prompt:
    "Write `function monthsBetween(a, b)` for valid Gregorian dates given as 'YYYY-MM-DD' strings.\n" +
    '- Define addMonths(d, m): move the calendar month forward by m, keeping the day of month but clamping it to the last day of the target month (Jan 31 + 1 month = Feb 28, or Feb 29 in a leap year).\n' +
    '- If b is on or after a, return the largest integer m >= 0 such that addMonths(a, m) is on or before b.\n' +
    '- If b is before a, return -monthsBetween(b, a).',
  cases(rng) {
    const out: unknown[][] = [
      ['2024-01-31', '2024-02-29'], ['2023-01-31', '2023-02-27'], ['2023-01-31', '2023-02-28'], ['2024-03-31', '2024-02-29'],
      ['2024-02-29', '2025-02-28'], ['2024-05-15', '2024-05-15'], ['2024-05-15', '2024-06-14'], ['2025-12-31', '2026-01-31'],
    ];
    for (let i = 0; i < 8; i++) {
      const a = Date.UTC(2023, 0, 1) + rng.int(0, 1300) * DAY;
      const b = rng.next() < 0.3 ? Date.UTC(new Date(a).getUTCFullYear(), new Date(a).getUTCMonth() + rng.int(-14, 14) + 1, 0) : a + rng.int(-500, 500) * DAY;
      out.push([isoDay(a), isoDay(b)]);
    }
    return out;
  },
  ref: monthsRef,
});

function topoRef(nodes: string[], edges: Array<[string, string]>): Expect {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) { adj.get(a)!.push(b); indeg.set(b, indeg.get(b)! + 1); }
  const done = new Set<string>();
  const order: string[] = [];
  while (order.length < nodes.length) {
    const ready = nodes.filter((n) => !done.has(n) && indeg.get(n) === 0);
    if (!ready.length) return err('Error');
    const n = ready.reduce((m, x) => (x < m ? x : m));
    done.add(n);
    order.push(n);
    for (const b of adj.get(n)!) indeg.set(b, indeg.get(b)! - 1);
  }
  return ok(order);
}

const topoSort = fnTask({
  id: 'code-js-topo-smallest-1',
  lang: 'node',
  difficulty: 2,
  fn: 'topoSort',
  prompt:
    'Write `function topoSort(nodes, edges)`.\n' +
    '- `nodes` is an array of distinct strings; `edges` is an array of [a, b] pairs meaning a must come before b (both are in `nodes`; the same pair may appear more than once).\n' +
    '- Return the valid ordering of all nodes that is lexicographically smallest when compared element by element (compare strings with < as JavaScript does, so "B" < "a").\n' +
    "- If no valid ordering exists (a cycle, including an edge from a node to itself), throw new Error('cycle').",
  cases(rng) {
    const out: unknown[][] = [
      [[], []], [['b', 'a', 'c'], []], [['a', 'B'], []], [['a', 'b'], [['a', 'a']]], [['x', 'y', 'z'], [['z', 'x'], ['z', 'x'], ['y', 'z']]],
      [['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]], [['d', 'c', 'b', 'a'], [['d', 'a'], ['c', 'a']]],
    ];
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'B', 'D', 'aa', 'ab'];
    for (let i = 0; i < 8; i++) {
      const nodes = rng.shuffle(pool).slice(0, rng.int(2, 8));
      const rank = rng.shuffle(nodes);
      const edges: Array<[string, string]> = [];
      for (let k = rng.int(0, nodes.length + 2); k > 0; k--) {
        const x = rng.int(0, rank.length - 1), y = rng.int(0, rank.length - 1);
        if (x !== y) edges.push(x < y ? [rank[x], rank[y]] : [rank[y], rank[x]]);
      }
      if (rng.next() < 0.25 && edges.length) { const [p, q] = edges[0]; edges.push([q, p]); }
      out.push([nodes, edges]);
    }
    return out;
  },
  ref: topoRef,
});

export const CODE_TASKS: V4Task[] = [
  codeMergeIntervals,
  parseDuration, businessDays, editCost, evaluate, rle, topK, spiral, csv, lru, maxWeight, roman, versions, flatten,
  groupSum, debounce, deepEqual, parseQuery, monthsBetween, topoSort,
];
