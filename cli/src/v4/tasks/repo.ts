import type { ToolDef, V4Task } from '../types.js';

// Mini SWE-bench: a small Python package with a failing test. The model explores
// with tools, edits files, and runs the visible tests in the sandbox. Grading
// runs visible + hidden tests on the final files, so hardcoding the visible
// case doesn't pass.

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

export const repoTieredPricing: V4Task = {
  id: 'repo-tiered-pricing-1',
  suite: 'repo',
  difficulty: 3,
  build(rng) {
    const t1 = rng.pick([10, 20, 25]);
    const t2 = t1 * rng.pick([3, 4, 5]);
    const d1 = rng.pick([5, 8, 10]);
    const d2 = d1 + rng.pick([5, 7, 10]);
    const files: Record<string, string> = {
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
    };
    const hidden =
      'import unittest\nfrom shop.pricing import line_total, discount_percent\n\n\n' +
      'class Hidden(unittest.TestCase):\n' +
      `    def test_second_tier_boundary(self):\n        self.assertEqual(discount_percent(${t2}), ${d2})\n\n` +
      `    def test_between(self):\n        self.assertEqual(discount_percent(${t2 - 1}), ${d1})\n\n` +
      '    def test_zero(self):\n        self.assertEqual(line_total(9.99, 0), 0.0)\n\n' +
      '    def test_negative(self):\n        with self.assertRaises(ValueError):\n            line_total(1, -1)\n\n' +
      '    def test_rounding(self):\n        self.assertEqual(line_total(0.335, 1), 0.34)\n';

    const cmd = ['python', '-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'];
    return {
      kind: 'agent',
      maxTurns: 14,
      tools: TOOLS,
      messages: [
        { role: 'system', content: 'You are fixing a bug in a Python project. Use the tools to inspect files, make the smallest correct fix, and run the tests. Do not edit the tests. Reply with a one-line summary when done.' },
        { role: 'user', content: 'The pricing tests fail. Please fix the bug.' },
      ],
      async handle(call, ctx) {
        const a = call.arguments as Record<string, unknown>;
        switch (call.name) {
          case 'list_files': return Object.keys(files).sort().join('\n');
          case 'read_file': return files[String(a.path)] ?? `error: no such file ${a.path}`;
          case 'write_file': {
            const p = String(a.path);
            if (p.startsWith('tests/')) return 'error: tests are read-only';
            if (!(p in files)) return `error: no such file ${p} (create no new files)`;
            files[p] = String(a.content ?? '');
            return 'ok';
          }
          case 'run_tests': {
            const r = await ctx.sandbox.run({ image: 'python', files, cmd });
            return `${r.stderr}${r.stdout}`.slice(-3000) || `exit ${r.exitCode}`;
          }
          default: return `error: unknown tool ${call.name}`;
        }
      },
      async grade(_final, _t, ctx) {
        const r = await ctx.sandbox.run({ image: 'python', files: { ...files, 'tests/test_hidden.py': hidden }, cmd });
        const out = `${r.stderr}${r.stdout}`;
        const ran = Number(out.match(/Ran (\d+) test/)?.[1] ?? 0);
        const failed = Number(out.match(/failures=(\d+)/)?.[1] ?? 0) + Number(out.match(/errors=(\d+)/)?.[1] ?? 0);
        const passed = ran ? ran - failed : 0;
        return { score: ran === 8 && failed === 0 ? 1 : 0, detail: `${passed}/8 tests pass${failed ? ': ' + out.split('\n').filter((l) => /^(FAIL|ERROR):/.test(l)).join('; ').slice(0, 200) : ''}` };
      },
    };
  },
};
