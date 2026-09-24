import type { AgentInstance, Rng, ToolDef, V4Task } from '../types.js';

// Mini SWE-bench: a small project with a failing test. The model explores with
// tools, edits files, and runs the visible tests in the sandbox. Grading runs
// visible + hidden tests on the final files, so hardcoding the visible case
// doesn't pass.

const TOOLS: ToolDef[] = [
  { name: 'list_files', description: 'List every file path in the project.', parameters: { type: 'object', properties: {} } },
  {
    name: 'read_file', description: 'Read a file.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file', description: 'Overwrite a file with new full contents.',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  { name: 'run_tests', description: 'Run the visible test suite and return its output.', parameters: { type: 'object', properties: {} } },
];

const PY_CMD = ['python', '-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'];
const NODE_CMD = ['node', '--test'];

function counts(lang: 'python' | 'node', out: string): { ran: number; failed: number } {
  if (lang === 'python') {
    const ran = Number(out.match(/Ran (\d+) test/)?.[1] ?? 0);
    const failed = Number(out.match(/failures=(\d+)/)?.[1] ?? 0) + Number(out.match(/errors=(\d+)/)?.[1] ?? 0);
    return { ran, failed };
  }
  const pass = Number(out.match(/^# pass (\d+)/m)?.[1] ?? 0);
  const fail = Number(out.match(/^# fail (\d+)/m)?.[1] ?? 0);
  return { ran: pass + fail, failed: fail };
}

function repoInstance(o: {
  lang: 'python' | 'node';
  files: Record<string, string>;
  hiddenPath: string;
  hidden: string;
  totalTests: number;
  user: string;
}): AgentInstance {
  const files = o.files;
  const testDir = o.lang === 'python' ? 'tests/' : 'test/';
  const image = o.lang;
  const cmd = o.lang === 'python' ? PY_CMD : NODE_CMD;
  return {
    kind: 'agent',
    maxTurns: 14,
    tools: TOOLS,
    messages: [
      { role: 'system', content: `You are fixing a bug in a ${o.lang === 'python' ? 'Python' : 'JavaScript'} project. Use the tools to inspect files, make the smallest correct fix that honours the documented behaviour, and run the tests. Do not edit the tests. Reply with a one-line summary when done.` },
      { role: 'user', content: o.user },
    ],
    async handle(call, ctx) {
      const a = call.arguments as Record<string, unknown>;
      switch (call.name) {
        case 'list_files': return Object.keys(files).sort().join('\n');
        case 'read_file': return files[String(a.path)] ?? `error: no such file ${a.path}`;
        case 'write_file': {
          const p = String(a.path);
          if (p.startsWith(testDir)) return 'error: tests are read-only';
          if (!(p in files)) return `error: no such file ${p} (create no new files)`;
          files[p] = String(a.content ?? '');
          return 'ok';
        }
        case 'run_tests': {
          const r = await ctx.sandbox.run({ image, files, cmd });
          return `${r.stderr}${r.stdout}`.slice(-3000) || `exit ${r.exitCode}`;
        }
        default: return `error: unknown tool ${call.name}`;
      }
    },
    async grade(_final, _t, ctx) {
      const r = await ctx.sandbox.run({ image, files: { ...files, [o.hiddenPath]: o.hidden }, cmd });
      const out = `${r.stderr}${r.stdout}`;
      const { ran, failed } = counts(o.lang, out);
      const passed = Math.max(0, ran - failed);
      const ok = ran === o.totalTests && failed === 0;
      const why = o.lang === 'python'
        ? out.split('\n').filter((l) => /^(FAIL|ERROR):/.test(l)).join('; ')
        : out.split('\n').filter((l) => /^not ok/.test(l.trim())).join('; ');
      return { score: ok ? 1 : 0, detail: `${passed}/${o.totalTests} tests pass${ok ? '' : ': ' + (why || out.slice(-160)).slice(0, 200)}` };
    },
  };
}

// ── 1. Boundary comparison (off-by-one on tier minimums) ─────────────────────
export const repoTieredPricing: V4Task = {
  id: 'repo-tiered-pricing-1',
  suite: 'repo',
  difficulty: 3,
  build(rng) {
    const t1 = rng.pick([10, 20, 25]);
    const t2 = t1 * rng.pick([3, 4, 5]);
    const d1 = rng.pick([5, 8, 10]);
    const d2 = d1 + rng.pick([5, 7, 10]);
    return repoInstance({
      lang: 'python',
      user: 'The pricing tests fail. Please fix the bug.',
      totalTests: 8,
      hiddenPath: 'tests/test_hidden.py',
      files: {
        'shop/__init__.py': '',
        'tests/__init__.py': '',
        'shop/tiers.py':
          `# Volume discount tiers: (minimum quantity, percent off). A tier applies\n# when quantity is AT LEAST its minimum.\nTIERS = [(${t2}, ${d2}), (${t1}, ${d1})]\n`,
        'shop/pricing.py':
          'from decimal import Decimal, ROUND_HALF_UP\n' +
          'from .tiers import TIERS\n\n\n' +
          'def discount_percent(qty):\n' +
          '    for minimum, pct in TIERS:\n' +
          '        if qty > minimum:\n' +
          '            return pct\n' +
          '    return 0\n\n\n' +
          'def line_total(unit_price, qty):\n' +
          '    """Total for a line, in dollars, rounded half-up to cents."""\n' +
          '    if qty < 0:\n' +
          '        raise ValueError("qty must be >= 0")\n' +
          '    gross = Decimal(str(unit_price)) * qty\n' +
          '    net = gross * (Decimal(100 - discount_percent(qty)) / 100)\n' +
          '    return float(net.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))\n',
        'tests/test_pricing.py':
          'import unittest\nfrom shop.pricing import line_total, discount_percent\n\n\n' +
          'class PricingTest(unittest.TestCase):\n' +
          `    def test_below_first_tier(self):\n        self.assertEqual(discount_percent(${t1 - 1}), 0)\n\n` +
          `    def test_exactly_first_tier(self):\n        self.assertEqual(discount_percent(${t1}), ${d1})\n\n` +
          `    def test_line_total(self):\n        self.assertEqual(line_total(2.5, ${t1}), ${Math.floor(2.5 * t1 * (100 - d1) + 0.5 + 1e-9) / 100})\n\n\n` +
          "if __name__ == '__main__':\n    unittest.main()\n",
        'README.md': 'Run tests: python -m unittest discover -s tests -t .\n',
      },
      hidden:
        'import unittest\nfrom shop.pricing import line_total, discount_percent\n\n\n' +
        'class Hidden(unittest.TestCase):\n' +
        `    def test_second_tier_boundary(self):\n        self.assertEqual(discount_percent(${t2}), ${d2})\n\n` +
        `    def test_between(self):\n        self.assertEqual(discount_percent(${t2 - 1}), ${d1})\n\n` +
        '    def test_zero(self):\n        self.assertEqual(line_total(9.99, 0), 0.0)\n\n' +
        '    def test_negative(self):\n        with self.assertRaises(ValueError):\n            line_total(1, -1)\n\n' +
        '    def test_rounding(self):\n        self.assertEqual(line_total(0.335, 1), 0.34)\n',
    });
  },
};

// ── 2. Aliasing: mutable default + shared caller list ────────────────────────
const GOODS = ['apple', 'bread', 'cheese', 'dates', 'eggs', 'flour', 'grapes', 'honey'];

export const repoCartAliasing: V4Task = {
  id: 'repo-cart-aliasing-1',
  suite: 'repo',
  difficulty: 2,
  build(rng: Rng) {
    const [g1, g2, g3] = rng.shuffle(GOODS);
    const p1 = rng.int(2, 9);
    const p2 = rng.int(10, 30);
    return repoInstance({
      lang: 'python',
      user: 'Customers report items showing up in other people\'s carts. The cart tests fail. Please fix it.',
      totalTests: 6,
      hiddenPath: 'tests/test_hidden.py',
      files: {
        'store/__init__.py': '',
        'tests/__init__.py': '',
        'store/cart.py':
          'class Cart:\n' +
          '    """A shopping cart.\n\n' +
          '    A cart always keeps its OWN list of (name, price) items: changing the\n' +
          '    list passed to the constructor, or another cart, never changes this one.\n' +
          '    """\n\n' +
          '    def __init__(self, items=[]):\n' +
          '        self.items = items\n\n' +
          '    def add(self, name, price):\n' +
          '        self.items.append((name, price))\n\n' +
          '    def total(self):\n' +
          '        return sum(price for _, price in self.items)\n\n' +
          '    def merged(self, other):\n' +
          '        """Return a NEW cart holding both carts\' items; neither input changes."""\n' +
          '        result = Cart(self.items)\n' +
          '        for name, price in other.items:\n' +
          '            result.add(name, price)\n' +
          '        return result\n',
        'tests/test_cart.py':
          'import unittest\nfrom store.cart import Cart\n\n\n' +
          'class CartTest(unittest.TestCase):\n' +
          `    def test_new_carts_are_independent(self):\n        a = Cart()\n        a.add("${g1}", ${p1})\n        b = Cart()\n        self.assertEqual(b.items, [])\n\n` +
          `    def test_total(self):\n        c = Cart()\n        c.add("${g2}", ${p2})\n        self.assertEqual(c.total(), ${p2})\n\n\n` +
          "if __name__ == '__main__':\n    unittest.main()\n",
      },
      hidden:
        'import unittest\nfrom store.cart import Cart\n\n\n' +
        'class Hidden(unittest.TestCase):\n' +
        `    def test_keeps_given_items(self):\n        c = Cart([("${g1}", ${p1})])\n        self.assertEqual(c.total(), ${p1})\n\n` +
        `    def test_does_not_alias_caller_list(self):\n        src = [("${g1}", ${p1})]\n        c = Cart(src)\n        c.add("${g2}", ${p2})\n        self.assertEqual(src, [("${g1}", ${p1})])\n\n` +
        `    def test_merged_leaves_inputs_alone(self):\n        a = Cart([("${g1}", ${p1})])\n        b = Cart([("${g3}", ${p2})])\n        m = a.merged(b)\n        self.assertEqual(m.total(), ${p1 + p2})\n        self.assertEqual(a.total(), ${p1})\n        self.assertEqual(b.total(), ${p2})\n\n` +
        `    def test_default_after_use(self):\n        Cart().add("${g3}", 1)\n        self.assertEqual(Cart().total(), 0)\n`,
    });
  },
};

// ── 3. Parsing: accepts garbage instead of rejecting it ──────────────────────
export const repoDurationParse: V4Task = {
  id: 'repo-duration-parse-1',
  suite: 'repo',
  difficulty: 3,
  build(rng: Rng) {
    const bad = rng.pick(['5x', '12q', '7d', '3w']);
    const h = rng.int(1, 9);
    const m = rng.int(1, 59);
    const s = rng.int(1, 59);
    return repoInstance({
      lang: 'python',
      user: `parse_duration("${bad}") should be rejected but returns a number. The tests fail. Please fix it properly.`,
      totalTests: 11,
      hiddenPath: 'tests/test_hidden.py',
      files: {
        'timeparse/__init__.py': '',
        'tests/__init__.py': '',
        'timeparse/duration.py':
          'import re\n\n\n' +
          'def parse_duration(text):\n' +
          '    """Parse a duration like "2h", "45m", "1h30m" or "1h 5m 10s" into seconds.\n\n' +
          '    Units are h, m and s, in that order, each at most once, each with a\n' +
          '    whole number before it. Spaces between parts are allowed. Anything\n' +
          '    else (empty text, unknown units, bare numbers, repeated or\n' +
          '    out-of-order units) raises ValueError.\n' +
          '    """\n' +
          '    total = 0\n' +
          "    for value, unit in re.findall(r'(\\d+)([hms])', text):\n" +
          "        total += int(value) * {'h': 3600, 'm': 60, 's': 1}[unit]\n" +
          '    return total\n',
        'tests/test_duration.py':
          'import unittest\nfrom timeparse.duration import parse_duration\n\n\n' +
          'class DurationTest(unittest.TestCase):\n' +
          `    def test_hours_minutes(self):\n        self.assertEqual(parse_duration("${h}h${m}m"), ${h * 3600 + m * 60})\n\n` +
          `    def test_spaces(self):\n        self.assertEqual(parse_duration("${h}h ${m}m ${s}s"), ${h * 3600 + m * 60 + s})\n\n` +
          `    def test_unknown_unit(self):\n        with self.assertRaises(ValueError):\n            parse_duration("${bad}")\n\n\n` +
          "if __name__ == '__main__':\n    unittest.main()\n",
      },
      hidden:
        'import unittest\nfrom timeparse.duration import parse_duration\n\n\n' +
        'class Hidden(unittest.TestCase):\n' +
        `    def test_seconds_only(self):\n        self.assertEqual(parse_duration("${s}s"), ${s})\n\n` +
        ['""', `"${h}h${m}"`, '"h"', `"${m}m${h}h"`, `"${h}h${h}h"`, `"${s}"`, `"${h}h ${bad}"`]
          .map((x, i) => `    def test_reject_${i}(self):\n        with self.assertRaises(ValueError):\n            parse_duration(${x})\n`)
          .join('\n'),
    });
  },
};

// ── 4. Aggregation (JavaScript): overwrite instead of accumulate ─────────────
const CATS = ['books', 'garden', 'kitchen', 'toys', 'tools', 'music'];

export const repoJsCategoryTotals: V4Task = {
  id: 'repo-js-category-totals-1',
  suite: 'repo',
  difficulty: 2,
  build(rng: Rng) {
    const [c1, c2, c3] = rng.shuffle(CATS);
    const q = () => rng.int(1, 5);
    const p = () => rng.int(100, 2500);
    const lines1 = [{ category: c1, qty: q(), priceCents: p() }, { category: c1, qty: q(), priceCents: p() }];
    const want1 = lines1.reduce((a, l) => a + l.qty * l.priceCents, 0);
    const lines2 = [
      { category: c2, qty: q(), priceCents: p() }, { category: c3, qty: q(), priceCents: p() },
      { category: c2, qty: q(), priceCents: p() }, { category: c3, qty: 0, priceCents: p() },
      { category: c2, qty: q(), priceCents: p() },
    ];
    const want2: Record<string, number> = {};
    for (const l of lines2) want2[l.category] = (want2[l.category] ?? 0) + l.qty * l.priceCents;
    return repoInstance({
      lang: 'node',
      user: 'The category report undercounts. The tests fail. Please fix it.',
      totalTests: 5,
      hiddenPath: 'test/hidden.test.js',
      files: {
        'package.json': '{ "name": "report", "private": true, "type": "commonjs" }\n',
        'src/report.js':
          '// Sum qty * priceCents per category. Every category that appears in the\n' +
          '// input is present in the result, even when its total is 0. The input\n' +
          '// array and its line objects are never modified.\n' +
          'function categoryTotals(lines) {\n' +
          '  const totals = {};\n' +
          '  for (const l of lines) {\n' +
          '    totals[l.category] = l.qty * l.priceCents;\n' +
          '  }\n' +
          '  return totals;\n' +
          '}\n\n' +
          'module.exports = { categoryTotals };\n',
        'test/report.test.js':
          "const test = require('node:test');\nconst assert = require('node:assert');\nconst { categoryTotals } = require('../src/report.js');\n\n" +
          `test('sums repeated category', () => {\n  assert.deepStrictEqual(categoryTotals(${JSON.stringify(lines1)}), { ${JSON.stringify(c1)}: ${want1} });\n});\n\n` +
          "test('empty input', () => {\n  assert.deepStrictEqual(categoryTotals([]), {});\n});\n",
      },
      hidden:
        "const test = require('node:test');\nconst assert = require('node:assert');\nconst { categoryTotals } = require('../src/report.js');\n\n" +
        `test('mixed categories', () => {\n  assert.deepStrictEqual(categoryTotals(${JSON.stringify(lines2)}), ${JSON.stringify(want2)});\n});\n\n` +
        `test('zero total kept', () => {\n  assert.deepStrictEqual(categoryTotals([{ category: ${JSON.stringify(c3)}, qty: 0, priceCents: 999 }]), { ${JSON.stringify(c3)}: 0 });\n});\n\n` +
        `test('input untouched', () => {\n  const input = ${JSON.stringify(lines2)};\n  const copy = JSON.stringify(input);\n  categoryTotals(input);\n  assert.strictEqual(JSON.stringify(input), copy);\n});\n`,
    });
  },
};

export const REPO_TASKS: V4Task[] = [repoTieredPricing, repoCartAliasing, repoDurationParse, repoJsCategoryTotals];
