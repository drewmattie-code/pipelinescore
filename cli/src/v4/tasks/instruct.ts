import type { Grade, V4Task } from '../types.js';

// IFEval-style: every constraint is machine-checkable, and each one counts.
// Score = fraction of rules met, so one slip costs points, not the task.

function rules(checks: Array<[string, boolean]>): Grade {
  const failed = checks.filter(([, ok]) => !ok).map(([k]) => k);
  return {
    score: (checks.length - failed.length) / checks.length,
    detail: failed.length ? `failed: ${failed.join(', ')}` : `all ${checks.length} rules met`,
  };
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const lines = (s: string) => s.replace(/\r/g, '').trim().split('\n');
const countWord = (s: string, w: string, flags = 'gi') => (s.match(new RegExp(`\\b${w}\\b`, flags)) ?? []).length;

const TOPICS = ['home composting', 'learning to sail', 'remote team meetings', 'winter cycling', 'saving for a first home',
  'caring for houseplants', 'running a book club', 'backyard beekeeping', 'reducing screen time', 'planning a road trip'];

export const instructProductCopy: V4Task = {
  id: 'instruct-product-copy-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const product = rng.pick(['trail running shoe', 'cast-iron skillet', 'standing desk', 'e-bike battery', 'espresso grinder']);
    const bullets = rng.int(3, 5);
    const maxWords = rng.pick([9, 10, 12]);
    const banned = rng.pick(['amazing', 'perfect', 'ultimate', 'best']);
    const sku = `SKU-${rng.int(1000, 9999)}-${rng.pick(['A', 'B', 'X'])}`;
    const upper = rng.pick(['DURABLE', 'LIGHTWEIGHT', 'QUIET', 'FAST']);
    return {
      kind: 'single',
      maxTokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Write product copy for a ${product}. Rules:\n` +
          `1. Exactly ${bullets} bullet points, each starting with "- ".\n` +
          `2. Each bullet has at most ${maxWords} words.\n` +
          `3. Do not use the word "${banned}" anywhere, in any case.\n` +
          `4. The word ${upper} appears exactly once, in all capitals.\n` +
          `5. The last line is exactly "${sku}".\n` +
          `6. Nothing else: no title, no intro, no blank lines.`,
      }],
      grade(res) {
        const ls = lines(res.text);
        const bulletLines = ls.filter((l) => l.startsWith('- '));
        const n = (l: string) => l.slice(2).trim().split(/\s+/).filter(Boolean).length;
        return rules([
          ['bullet count', bulletLines.length === bullets],
          ['bullet length', bulletLines.length > 0 && bulletLines.every((l) => n(l) <= maxWords)],
          ['banned word', countWord(res.text, banned) === 0],
          ['caps word once', (() => {
            const all = res.text.match(new RegExp(`\\b${upper}\\b`, 'gi')) ?? [];
            return all.length === 1 && all[0] === upper;
          })()],
          ['last line', ls[ls.length - 1]?.trim() === sku],
          ['nothing else', ls.length === bullets + 1 && ls.every((l) => l.trim() !== '')],
        ]);
      },
    };
  },
};

export const instructJsonSchema: V4Task = {
  id: 'instruct-json-schema-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const thing = rng.pick(['warehouse item', 'library book', 'bakery product', 'camping gear item', 'museum exhibit']);
    const id = `${rng.pick(['WH', 'LB', 'BK', 'CG', 'MX'])}-${rng.int(100, 999)}`;
    const lo = rng.int(1, 40);
    const hi = lo + rng.int(5, 60);
    const nTags = rng.int(2, 5);
    const stock = rng.pick([true, false]);
    return {
      kind: 'single',
      maxTokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Return ONLY a JSON object (no code fences, no text before or after it) describing a fictional ${thing}. It must have exactly these keys and no others:\n` +
          `- "id": the string "${id}"\n` +
          `- "name": a string of 2 to 4 words\n` +
          `- "quantity": an integer from ${lo} to ${hi} inclusive\n` +
          `- "tags": an array of exactly ${nTags} different lowercase strings\n` +
          `- "in_stock": the boolean ${stock}`,
      }],
      grade(res) {
        const raw = res.text.trim();
        let obj: Record<string, unknown> | null = null;
        try {
          const v = JSON.parse(raw);
          if (v && typeof v === 'object' && !Array.isArray(v)) obj = v;
        } catch { /* not bare JSON */ }
        const o = obj ?? {};
        const tags = o.tags;
        return rules([
          ['bare JSON only', obj !== null],
          ['exact keys', JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['id', 'in_stock', 'name', 'quantity', 'tags'])],
          ['id and in_stock values', o.id === id && o.in_stock === stock],
          ['name 2-4 words', typeof o.name === 'string' && words(o.name).length >= 2 && words(o.name).length <= 4],
          ['quantity in range', Number.isInteger(o.quantity) && (o.quantity as number) >= lo && (o.quantity as number) <= hi],
          ['tags', Array.isArray(tags) && tags.length === nTags && tags.every((t) => typeof t === 'string' && t === t.toLowerCase() && t.trim() !== '')
            && new Set(tags).size === nTags],
        ]);
      },
    };
  },
};

export const instructLowercase: V4Task = {
  id: 'instruct-lowercase-range-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const lo = rng.pick([60, 80, 100]);
    const hi = lo + rng.pick([30, 40, 60]);
    const kw = rng.pick(['patience', 'budget', 'routine', 'weather', 'community']);
    const k = rng.int(2, 4);
    const end = rng.pick(['and that is the whole point', 'start small and keep going', 'the rest is practice']);
    return {
      kind: 'single',
      maxTokens: 2048,
      messages: [{
        role: 'user',
        content:
          `Write a short piece about ${topic}. Rules:\n` +
          `1. Between ${lo} and ${hi} words.\n` +
          `2. Use only lowercase letters: no capital letters anywhere.\n` +
          `3. Do not use any commas.\n` +
          `4. Use the word "${kw}" at least ${k} times.\n` +
          `5. End with the exact phrase "${end}" (a final period after it is allowed).`,
      }],
      grade(res) {
        const t = res.text.trim();
        const n = words(t).length;
        return rules([
          ['word count', n >= lo && n <= hi],
          ['all lowercase', t === t.toLowerCase()],
          ['no commas', !t.includes(',')],
          ['keyword count', countWord(t, kw) >= k],
          ['exact ending', t.replace(/[.]$/, '').endsWith(end)],
        ]);
      },
    };
  },
};

export const instructNumberedList: V4Task = {
  id: 'instruct-numbered-list-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const n = rng.int(5, 8);
    const maxW = rng.pick([8, 10, 12]);
    const j = rng.int(2, n);
    const w = rng.pick(['morning', 'friend', 'notebook', 'timer', 'map']);
    return {
      kind: 'single',
      maxTokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Give tips on ${topic}. Rules:\n` +
          `1. Output exactly ${n} lines, numbered "1." to "${n}." in order, and nothing else.\n` +
          `2. Each item has at most ${maxW} words, not counting its number.\n` +
          `3. Item ${j} must contain the word "${w}".\n` +
          `4. No item may start with the word "The".\n` +
          `5. No digits inside the items (digits only in the numbering).`,
      }],
      grade(res) {
        const ls = lines(res.text);
        const items = ls.map((l) => l.match(/^(\d+)\.\s+(.*)$/));
        const bodies = items.map((m) => m?.[2] ?? '');
        return rules([
          ['exactly N numbered lines', ls.length === n && items.every((m, i) => m !== null && Number(m[1]) === i + 1)],
          ['item length', bodies.every((b) => b !== '' && words(b).length <= maxW)],
          [`item ${j} word`, countWord(bodies[j - 1] ?? '', w) >= 1],
          ['no "The" start', bodies.every((b) => !/^the\b/i.test(b.trim()))],
          ['no digits in items', bodies.every((b) => !/\d/.test(b))],
        ]);
      },
    };
  },
};

export const instructSections: V4Task = {
  id: 'instruct-sections-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const heads = rng.shuffle(['Background', 'Risks', 'Costs', 'Timeline', 'Next Steps', 'Open Questions', 'Summary', 'Options']).slice(0, 3);
    const phrase = rng.pick(['measure twice', 'less is more', 'slow is smooth', 'good enough']);
    const banned = rng.pick(['basically', 'really', 'very', 'just']);
    const maxW = rng.pick([120, 150, 180]);
    return {
      kind: 'single',
      maxTokens: 2048,
      messages: [{
        role: 'user',
        content:
          `Write a brief about ${topic}. Rules:\n` +
          `1. Use exactly these three markdown headers, in this order, each on its own line: "## ${heads[0]}", "## ${heads[1]}", "## ${heads[2]}".\n` +
          `2. No other headers or lines starting with "#".\n` +
          `3. Put at least one sentence of text under every header.\n` +
          `4. Include the phrase ${phrase} wrapped in double quotes, like "${phrase}".\n` +
          `5. Do not use the word "${banned}".\n` +
          `6. At most ${maxW} words in total, headers included.`,
      }],
      grade(res) {
        const ls = lines(res.text);
        const hashLines = ls.map((l, i) => [l.trim(), i] as const).filter(([l]) => l.startsWith('#'));
        const exact = hashLines.length === 3 && hashLines.every(([l], i) => l === `## ${heads[i]}`);
        const bodies = exact
          ? hashLines.map(([, idx], i) => ls.slice(idx + 1, i < 2 ? hashLines[i + 1][1] : ls.length).join(' ').trim())
          : [];
        return rules([
          ['headers exact and in order', exact],
          ['no other headers', hashLines.length === 3],
          ['text under every header', exact && bodies.every((b) => words(b).length > 0)],
          ['quoted phrase', res.text.includes(`"${phrase}"`)],
          ['banned word', countWord(res.text, banned) === 0],
          ['word limit', words(res.text).length <= maxW],
        ]);
      },
    };
  },
};

export const instructParagraphs: V4Task = {
  id: 'instruct-paragraphs-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const n = rng.int(3, 5);
    const k = rng.int(2, n);
    const first = rng.pick(['However', 'Meanwhile', 'Surprisingly', 'Finally', 'Still']);
    const lo = rng.pick([15, 20]);
    const hi = lo + rng.pick([30, 45]);
    const banned = rng.pick(['things', 'stuff', 'nice', 'great']);
    return {
      kind: 'single',
      maxTokens: 2048,
      messages: [{
        role: 'user',
        content:
          `Write about ${topic}. Rules:\n` +
          `1. Exactly ${n} paragraphs, separated from each other by a line containing only ***.\n` +
          `2. Paragraph ${k} must start with the word "${first}".\n` +
          `3. Every paragraph has between ${lo} and ${hi} words.\n` +
          `4. Do not use the word "${banned}".\n` +
          `5. No bullet points or numbered lists.`,
      }],
      grade(res) {
        const paras = res.text.replace(/\r/g, '').trim().split(/\n[ \t]*\*\*\*[ \t]*\n/).map((p) => p.trim());
        const firstWord = (p: string) => (p.match(/^[^\p{L}]*(\p{L}+)/u)?.[1] ?? '');
        return rules([
          ['paragraph count', paras.length === n && paras.every((p) => p !== '')],
          [`paragraph ${k} opener`, firstWord(paras[k - 1] ?? '').toLowerCase() === first.toLowerCase()],
          ['paragraph lengths', paras.every((p) => { const c = words(p).length; return c >= lo && c <= hi; })],
          ['banned word', countWord(res.text, banned) === 0],
          ['no lists', !lines(res.text).some((l) => /^\s*([-*•]|\d+[.)])\s/.test(l))],
        ]);
      },
    };
  },
};

export const instructRepeatRequest: V4Task = {
  id: 'instruct-repeat-request-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const who = rng.pick(['a busy parent', 'a retired teacher', 'a college student', 'a small business owner']);
    const kw = rng.pick(['habit', 'cost', 'safety', 'time']);
    const maxW = rng.pick([60, 80, 100]);
    const close = rng.pick(['Hope this helps.', 'That is my take.', 'Good luck with it.']);
    const request = `Explain why ${topic} is worth it for ${who}, using the word ${kw} at least twice, in at most ${maxW} words, and end with "${close}"`;
    return {
      kind: 'single',
      maxTokens: 2048,
      messages: [{
        role: 'user',
        content:
          `First repeat the request below word for word without change, then give your answer. ` +
          `Do not write anything before the repeated request, and do not repeat this instruction sentence.\n\n${request}`,
      }],
      grade(res) {
        const t = res.text.replace(/\r/g, '').trim();
        const starts = t.startsWith(request);
        const answer = starts ? t.slice(request.length).trim() : t;
        return rules([
          ['starts with the exact request', starts],
          ['answer present', words(answer).length > 0],
          ['answer word limit', words(answer).length <= maxW],
          ['keyword twice', countWord(answer, kw) >= 2],
          ['exact closing', answer.endsWith(close)],
        ]);
      },
    };
  },
};

export const instructCsv: V4Task = {
  id: 'instruct-csv-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const [h1, h2, h3] = rng.pick([['city', 'population_k', 'country'], ['sku', 'units', 'warehouse'], ['team', 'points', 'league'], ['species', 'count', 'habitat']]);
    const n = rng.int(4, 8);
    const lo = rng.int(1, 50);
    const hi = lo + rng.int(100, 900);
    return {
      kind: 'single',
      maxTokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Output a small CSV of made-up data and nothing else (no code fences, no commentary). Rules:\n` +
          `1. The first line is exactly: ${h1},${h2},${h3}\n` +
          `2. Then exactly ${n} data rows, each with exactly 3 fields.\n` +
          `3. Every ${h2} value is an integer from ${lo} to ${hi}.\n` +
          `4. Rows are sorted by ${h2} from smallest to largest.\n` +
          `5. Every ${h1} value is unique, lowercase, and has no spaces.\n` +
          `6. No quote characters and no blank lines anywhere.`,
      }],
      grade(res) {
        const raw = res.text.replace(/\r/g, '').trim();
        const ls = raw.split('\n');
        const rows = ls.slice(1).map((l) => l.split(','));
        const nums = rows.map((r) => (r[1] !== undefined && /^\d+$/.test(r[1].trim()) ? Number(r[1]) : NaN));
        const keys = rows.map((r) => r[0] ?? '');
        return rules([
          ['header', ls[0] === `${h1},${h2},${h3}`],
          ['row count and width', rows.length === n && rows.every((r) => r.length === 3)],
          ['integers in range', nums.every((x) => Number.isInteger(x) && x >= lo && x <= hi)],
          ['sorted', nums.every((x, i) => i === 0 || x >= nums[i - 1])],
          ['unique lowercase keys', keys.every((k) => k !== '' && k === k.toLowerCase() && !/\s/.test(k)) && new Set(keys).size === keys.length],
          ['no quotes or blank lines', !/["']/.test(raw) && ls.every((l) => l.trim() !== '')],
        ]);
      },
    };
  },
};

export const instructUppercaseNotice: V4Task = {
  id: 'instruct-uppercase-notice-1',
  suite: 'instruct',
  difficulty: 2,
  build(rng) {
    const topic = rng.pick(['a water shut-off', 'a parking lot repaving', 'a fire drill', 'a server maintenance window', 'a lost-and-found clear-out']);
    const kw = rng.pick(['NOTICE', 'PLEASE', 'SCHEDULE', 'REMINDER']);
    const k = rng.int(2, 3);
    const lo = rng.pick([30, 40]);
    const hi = lo + rng.pick([30, 50]);
    return {
      kind: 'single',
      maxTokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Write a building notice about ${topic}. Rules:\n` +
          `1. The first line is a title wrapped in double angle brackets, like <<TITLE HERE>>.\n` +
          `2. The whole response is in capital letters.\n` +
          `3. Use the word ${kw} at least ${k} times.\n` +
          `4. No exclamation marks.\n` +
          `5. Between ${lo} and ${hi} words in total, title included.`,
      }],
      grade(res) {
        const t = res.text.trim();
        const n = words(t).length;
        return rules([
          ['<<title>> first line', /^<<[^<>\n]+>>$/.test(lines(t)[0]?.trim() ?? '')],
          ['all capitals', t === t.toUpperCase()],
          ['keyword count', countWord(t, kw, 'g') >= k],
          ['no exclamation marks', !t.includes('!')],
          ['word count', n >= lo && n <= hi],
        ]);
      },
    };
  },
};

export const instructPostscript: V4Task = {
  id: 'instruct-postscript-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const who = rng.pick(['a new neighbour', 'a team of volunteers', 'a club treasurer', 'a first-time manager']);
    const n = rng.int(3, 5);
    const h = rng.int(2, 3);
    const banned = rng.pick(['awesome', 'simply', 'literally', 'honestly']);
    return {
      kind: 'single',
      maxTokens: 1024,
      messages: [{
        role: 'user',
        content:
          `Write a note to ${who} about ${topic}. Rules:\n` +
          `1. Exactly ${n} bullet points, each line starting with "* ".\n` +
          `2. Highlight at least ${h} phrases inside the bullets with single asterisks, like *this phrase*.\n` +
          `3. No digits anywhere.\n` +
          `4. The final line is a postscript starting with "P.S."\n` +
          `5. Do not use the word "${banned}".`,
      }],
      grade(res) {
        const ls = lines(res.text);
        const bullets = ls.filter((l) => l.startsWith('* '));
        const highlights = bullets.reduce((s, l) => s + (l.slice(2).match(/\*[^*\n]+\*/g) ?? []).length, 0);
        return rules([
          ['bullet count', bullets.length === n],
          ['highlights', highlights >= h],
          ['no digits', !/\d/.test(res.text)],
          ['P.S. last line', (ls[ls.length - 1] ?? '').trim().startsWith('P.S.')],
          ['banned word', countWord(res.text, banned) === 0],
        ]);
      },
    };
  },
};

export const INSTRUCT_TASKS: V4Task[] = [
  instructProductCopy,
  instructJsonSchema,
  instructLowercase,
  instructNumberedList,
  instructSections,
  instructParagraphs,
  instructRepeatRequest,
  instructCsv,
  instructUppercaseNotice,
  instructPostscript,
];
