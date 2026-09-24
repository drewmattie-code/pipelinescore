// v4 CODE suite grader tests: for every task and several seeds, an independent
// correct solution must score exactly 1 and a plausible buggy one must score < 1.
// Run: npx tsx test/v4-code.test.ts   (needs Docker)
import { taskRng } from '../src/v4/rng.js';
import { DockerSandbox, dockerStatus } from '../src/v4/sandbox.js';
import { CODE_TASKS } from '../src/v4/tasks/code.js';
import type { ChatResponse, GradeContext, SingleInstance } from '../src/v4/types.js';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctx: GradeContext = { sandbox: new DockerSandbox() };
const py = (src: string) => '```python\n' + src.trim() + '\n```';
const js = (src: string) => '```javascript\n' + src.trim() + '\n```';
const resp = (text: string): ChatResponse => ({ text, toolCalls: [], latencyMs: 1 });

// Each entry: [correct answer, buggy answer]. The bug is one realistic mistake.
const S: Record<string, [string, string]> = {};

S['code-merge-gap-1'] = [
  py(`
def merge_close(intervals, gap):
    s = sorted([min(a, b), max(a, b)] for a, b in intervals)
    out = []
    for a, b in s:
        if out and a - out[-1][1] <= gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out`),
  py(`
def merge_close(intervals, gap):
    s = sorted([min(a, b), max(a, b)] for a, b in intervals)
    out = []
    for a, b in s:
        if out and a - out[-1][1] < gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out`),
];

const DURATION = `
import re
def parse_duration(s):
    t = s.strip(' ')
    if not t:
        raise ValueError('empty')
    mult = {'d': 86400, 'h': 3600, 'm': 60, 's': 1}
    pos, last, total = 0, -1, 0
    while pos < len(t):
        while pos < len(t) and t[pos] == ' ':
            pos += 1
        m = re.match(r'([0-9]+)([dhms])', t[pos:])
        if not m:
            raise ValueError(t)
        u = 'dhms'.index(m.group(2))
        if u <= last:
            raise ValueError(t)
        last = u
        total += int(m.group(1)) * mult[m.group(2)]
        pos += m.end()
    return total`;
S['code-parse-duration-1'] = [py(DURATION), py(DURATION.replace('if u <= last:', 'if False:'))];

const BIZ = `
from datetime import date, timedelta
def add_business_days(date_str, n, holidays):
    if n == 0:
        return date_str
    hol = set(holidays)
    d = date.fromisoformat(date_str)
    step = 1 if n > 0 else -1
    left = abs(n)
    while left:
        d += timedelta(days=step)
        if d.weekday() < 5 and d.isoformat() not in hol:
            left -= 1
    return d.isoformat()`;
S['code-business-days-1'] = [py(BIZ), py(BIZ.replace('hol = set(holidays)', 'hol = set()'))];

const OSA = `
def min_cost(a, b):
    n, m = len(a), len(b)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1): d[i][0] = i
    for j in range(m + 1): d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (0 if a[i-1] == b[j-1] else 2))
            if i > 1 and j > 1 and a[i-1] == b[j-2] and a[i-2] == b[j-1]:
                d[i][j] = min(d[i][j], d[i-2][j-2] + 1)
    return d[n][m]`;
S['code-edit-cost-osa-1'] = [py(OSA), py(OSA.replace('if i > 1 and j > 1', 'if False and i > 1'))];

const EVAL = `
def evaluate(expr):
    toks = []
    i = 0
    while i < len(expr):
        c = expr[i]
        if c == ' ':
            i += 1
            continue
        if c.isdigit():
            j = i
            while j < len(expr) and expr[j].isdigit():
                j += 1
            toks.append(int(expr[i:j]))
            i = j
            continue
        toks.append(c)
        i += 1
    pos = [0]
    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else None
    def take():
        t = toks[pos[0]]
        pos[0] += 1
        return t
    def ex():
        v = term()
        while peek() in ('+', '-'):
            op = take()
            r = term()
            v = v + r if op == '+' else v - r
        return v
    def term():
        v = unary()
        while peek() in ('*', '/'):
            op = take()
            r = unary()
            if op == '*':
                v = v * r
            else:
                if r == 0:
                    raise ZeroDivisionError()
                q = abs(v) // abs(r)
                v = q if (v >= 0) == (r >= 0) else -q
        return v
    def unary():
        if peek() == '-':
            take()
            return -unary()
        t = take()
        if t == '(':
            v = ex()
            take()
            return v
        return t
    return ex()`;
S['code-eval-trunc-div-1'] = [
  py(EVAL),
  py(EVAL.replace(`                q = abs(v) // abs(r)
                v = q if (v >= 0) == (r >= 0) else -q`, `                v = v // r`)),
];

const RLE = `
import re
def rle_encode(s):
    out, i = [], 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        out.append((str(j - i) if j - i > 1 else '') + s[i])
        i = j
    return ''.join(out)
def rle_decode(t):
    if not re.fullmatch(r'(?:[0-9]*[a-z])*', t):
        raise ValueError(t)
    s = ''.join(ch * (int(n) if n else 1) for n, ch in re.findall(r'([0-9]*)([a-z])', t))
    if rle_encode(s) != t:
        raise ValueError(t)
    return s`;
S['code-rle-canonical-1'] = [py(RLE), py(RLE.replace('if rle_encode(s) != t:', 'if False:'))];

const TOPK = `
import re
def top_k_words(text, k):
    counts, first = {}, {}
    for raw in re.findall(r"[A-Za-z']+", text):
        w = raw.lower().strip("'")
        if not w:
            continue
        if w not in counts:
            counts[w] = 0
            first[w] = len(first)
        counts[w] += 1
    order = sorted(counts, key=lambda w: (-counts[w], first[w]))
    return [[w, counts[w]] for w in order[:k]]`;
S['code-top-k-words-1'] = [py(TOPK), py(TOPK.replace('(-counts[w], first[w])', '(-counts[w], w)'))];

const SPIRAL = `
def spiral(matrix):
    out = []
    if not matrix or not matrix[0]:
        return out
    top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for j in range(left, right + 1):
            out.append(matrix[top][j])
        top += 1
        for i in range(top, bottom + 1):
            out.append(matrix[i][right])
        right -= 1
        if top <= bottom:
            for j in range(right, left - 1, -1):
                out.append(matrix[bottom][j])
            bottom -= 1
        if left <= right:
            for i in range(bottom, top - 1, -1):
                out.append(matrix[i][left])
            left += 1
    return out`;
S['code-spiral-1'] = [py(SPIRAL), py(SPIRAL.replace('if top <= bottom:', 'if True:').replace('if left <= right:', 'if True:'))];

const CSV = `
def parse_csv(text):
    if text == '':
        return []
    rows, row, field = [], [], []
    i, n = 0, len(text)
    in_q = after_q = ended_nl = False
    at_start = True
    while i < n:
        c = text[i]
        ended_nl = False
        if in_q:
            if c == '"':
                if i + 1 < n and text[i + 1] == '"':
                    field.append('"')
                    i += 2
                    continue
                in_q, after_q = False, True
                i += 1
                continue
            field.append(c)
            i += 1
            continue
        if c == '"':
            if at_start:
                in_q, at_start = True, False
                i += 1
                continue
            raise ValueError('stray quote')
        if c == ',':
            row.append(''.join(field))
            field, after_q, at_start = [], False, True
            i += 1
            continue
        if c == '\\n' or (c == '\\r' and i + 1 < n and text[i + 1] == '\\n'):
            row.append(''.join(field))
            rows.append(row)
            row, field, after_q, at_start, ended_nl = [], [], False, True, True
            i += 2 if c == '\\r' else 1
            continue
        if after_q:
            raise ValueError('text after closing quote')
        field.append(c)
        at_start = False
        i += 1
    if in_q:
        raise ValueError('unterminated quote')
    if not ended_nl:
        row.append(''.join(field))
        rows.append(row)
    return rows`;
S['code-csv-parse-1'] = [py(CSV), py(CSV.replace('    if not ended_nl:\n        row.append', '    if True:\n        row.append'))];

const LRU = `
from collections import OrderedDict
class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.d = OrderedDict()
    def get(self, key):
        if key not in self.d:
            return -1
        self.d.move_to_end(key)
        return self.d[key]
    def put(self, key, value):
        if self.cap <= 0:
            return
        if key in self.d:
            self.d.move_to_end(key)
        self.d[key] = value
        if len(self.d) > self.cap:
            self.d.popitem(last=False)`;
S['code-lru-cache-1'] = [py(LRU), py(LRU.replace('        if key in self.d:\n            self.d.move_to_end(key)\n', ''))];

const WEIGHT = `
def max_weight(jobs):
    js = sorted(jobs, key=lambda j: j[1])
    dp = [0] * (len(js) + 1)
    for i, (s, e, w) in enumerate(js, 1):
        k = 0
        for j in range(i - 1, 0, -1):
            if js[j - 1][1] <= s:
                k = j
                break
        dp[i] = max(dp[i - 1], w + dp[k])
    return dp[-1]`;
S['code-weighted-schedule-1'] = [py(WEIGHT), py(WEIGHT.replace('js[j - 1][1] <= s', 'js[j - 1][1] < s'))];

const ROMAN = `
VALS = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),(50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]
def to_roman(n):
    if not isinstance(n, int) or not 1 <= n <= 3999:
        raise ValueError(n)
    out = ''
    for v, s in VALS:
        while n >= v:
            out += s
            n -= v
    return out
def from_roman(s):
    if not isinstance(s, str) or not s or any(c not in 'MDCLXVI' for c in s):
        raise ValueError(s)
    i = total = 0
    for v, sym in VALS:
        while s.startswith(sym, i):
            total += v
            i += len(sym)
    if i != len(s) or not 1 <= total <= 3999 or to_roman(total) != s:
        raise ValueError(s)
    return total`;
S['code-roman-strict-1'] = [
  py(ROMAN),
  py(ROMAN.split('def from_roman')[0] + `
def from_roman(s):
    m = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    total = 0
    for i, c in enumerate(s):
        v = m[c]
        if i + 1 < len(s) and m[s[i + 1]] > v:
            total -= v
        else:
            total += v
    return total`),
];

const VERSIONS = `
import re
def sort_versions(versions):
    def key(v):
        m = re.fullmatch(r'(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?(?:-([0-9A-Za-z]+))?', v)
        nums = tuple(int(x) if x else 0 for x in m.group(1, 2, 3))
        pre = m.group(4)
        if pre is None:
            pk = (1,)
        elif pre.isdigit():
            pk = (0, 0, int(pre), '')
        else:
            pk = (0, 1, 0, pre)
        return nums + (pk,)
    return sorted(versions, key=key)`;
S['code-version-sort-1'] = [py(VERSIONS), py(VERSIONS.replace('int(x) if x else 0', "x if x else '0'"))];

const FLATTEN = `
def flatten(obj, sep='.'):
    out = {}
    def walk(v, path):
        if isinstance(v, dict) and v:
            for k, x in v.items():
                walk(x, path + sep + k)
        elif isinstance(v, list) and v:
            for i, x in enumerate(v):
                walk(x, path + sep + str(i))
        else:
            out[path] = v
    for k, v in obj.items():
        walk(v, k)
    return out`;
S['code-flatten-paths-1'] = [py(FLATTEN), py(FLATTEN.replace('        else:\n            out[path] = v', '        elif not isinstance(v, (dict, list)):\n            out[path] = v'))];

const GROUP = `
function groupSum(rows, keys, field) {
  const groups = new Map();
  const out = [];
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
    g.total += typeof r[field] === 'number' ? r[field] : 0;
    g.count++;
  }
  return out;
}`;
S['code-js-group-sum-1'] = [js(GROUP), js(GROUP.replace("keys.map((k) => (r[k] === undefined ? ['u'] : [typeof r[k], r[k]]))", "keys.map((k) => String(r[k]))"))];

const DEBOUNCE = `
function debounceEvents(events, wait) {
  const out = [];
  let p = null;
  for (const [t, v] of events) {
    if (p && p[0] <= t) { out.push(p); p = null; }
    p = [t + wait, v];
  }
  if (p) out.push(p);
  return out;
}`;
S['code-js-debounce-sim-1'] = [js(DEBOUNCE), js(DEBOUNCE.replace('p[0] <= t', 'p[0] < t'))];

S['code-js-deep-equal-1'] = [
  js(`
function deepEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return a === b;
}`),
  js(`function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }`),
];

const QUERY = `
function decode(s) {
  s = s.replace(/\\+/g, ' ');
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s[i] === '%' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      const bytes = [];
      while (s[i] === '%' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 3; }
      out += Buffer.from(bytes).toString('utf8');
    } else { out += s[i]; i++; }
  }
  return out;
}
function parseQuery(qs) {
  const out = {};
  for (const piece of qs.replace(/^\\?/, '').split('&')) {
    if (!piece) continue;
    const eq = piece.indexOf('=');
    let k = decode(eq < 0 ? piece : piece.slice(0, eq));
    const v = decode(eq < 0 ? '' : piece.slice(eq + 1));
    let forced = false;
    if (k.endsWith('[]')) { k = k.slice(0, -2); forced = true; }
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      if (Array.isArray(out[k])) out[k].push(v); else out[k] = [out[k], v];
    } else out[k] = forced ? [v] : v;
  }
  return out;
}`;
S['code-js-parse-query-1'] = [
  js(QUERY),
  js(QUERY.replace(/function decode\(s\) \{[\s\S]*?\n\}\n/, "function decode(s) { s = s.replace(/\\+/g, ' '); try { return decodeURIComponent(s); } catch { return s; } }\n")),
];

const MONTHS = `
function addMonths(d, m) {
  const y = Number(d.slice(0, 4)), mo = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  const total = y * 12 + (mo - 1) + m;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ny + '-' + String(nm).padStart(2, '0') + '-' + String(Math.min(day, last)).padStart(2, '0');
}
function monthsBetween(a, b) {
  if (b < a) return -monthsBetween(b, a);
  let m = 0;
  while (addMonths(a, m + 1) <= b) m++;
  return m;
}`;
S['code-js-months-between-1'] = [
  js(MONTHS),
  js(`
function monthsBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  let m = (y2 - y1) * 12 + (m2 - m1);
  if (m > 0 && d2 < d1) m--;
  if (m < 0 && d2 > d1) m++;
  return m;
}`),
];

const TOPO = `
function topoSort(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) { adj.get(a).push(b); indeg.set(b, indeg.get(b) + 1); }
  const done = new Set();
  const order = [];
  while (order.length < nodes.length) {
    const ready = nodes.filter((n) => !done.has(n) && indeg.get(n) === 0);
    if (!ready.length) throw new Error('cycle');
    const n = ready.reduce((m, x) => (x < m ? x : m));
    done.add(n);
    order.push(n);
    for (const b of adj.get(n)) indeg.set(b, indeg.get(b) - 1);
  }
  return order;
}`;
S['code-js-topo-smallest-1'] = [js(TOPO), js(TOPO.replace('ready.reduce((m, x) => (x < m ? x : m))', 'ready[0]'))];

// ── run ──────────────────────────────────────────────────────────────────────
check('20 code tasks', CODE_TASKS.length === 20, String(CODE_TASKS.length));
check('14 python + 6 javascript', CODE_TASKS.filter((t) => t.id.startsWith('code-js-')).length === 6);
check('ids unique', new Set(CODE_TASKS.map((t) => t.id)).size === CODE_TASKS.length);
check('every task has a solution pair', CODE_TASKS.every((t) => S[t.id]), CODE_TASKS.filter((t) => !S[t.id]).map((t) => t.id).join(','));

const SEEDS = ['s1', 's2', 'alpha', 'x9'];
const jobs: Array<Promise<void>> = [];
for (const t of CODE_TASKS) {
  const [good, bad] = S[t.id] ?? ['', ''];
  for (const seed of SEEDS) {
    jobs.push((async () => {
      const inst = t.build(taskRng(seed, t.id)) as SingleInstance;
      const g = await inst.grade(resp(good), ctx);
      const b = await inst.grade(resp(bad), ctx);
      check(`${t.id} correct solution scores 1 [${seed}]`, g.score === 1, g.detail);
      check(`${t.id} buggy solution scores < 1 [${seed}]`, b.score < 1, b.detail);
    })());
  }
}
// A few sandbox runs at a time keeps the test fast without overloading Docker.
for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8));

// Prompts never leak an expected output, and templates vary by seed.
{
  const t = CODE_TASKS.find((x) => x.id === 'code-business-days-1')!;
  const a = JSON.stringify((t.build(taskRng('p1', t.id)) as SingleInstance).messages);
  check('prompt is seed-independent text (cases hidden)', !/20\d\d-\d\d-\d\d/.test(a.replace(/'YYYY-MM-DD'/g, '')), a.slice(0, 120));
}
{
  const t = CODE_TASKS.find((x) => x.id === 'code-eval-trunc-div-1')!;
  const inst = t.build(taskRng('s1', t.id)) as SingleInstance;
  const r = await inst.grade(resp(py('def evaluate(expr):\n    return eval(expr)')), ctx);
  check('eval() is refused', r.score === 0, r.detail);
}

if (!dockerStatus().ok) console.log('NOTE  Docker not running: sandboxed checks above will have failed');
console.log(failures ? `\n${failures} FAILED` : '\nall v4 code tests passed');
process.exit(failures ? 1 : 0);
