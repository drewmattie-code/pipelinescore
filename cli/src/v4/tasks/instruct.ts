import type { Grade, SingleInstance, V4Task } from '../types.js';

// IFEval-style, hardened: 7-10 interacting rules per task, every one
// machine-checkable with exactly one reading. Word and sentence are defined in
// every prompt that counts them. Most tasks score the fraction of rules met;
// two are all-or-nothing so the suite isn't too forgiving.
// Each instance also carries `spec` (the drawn values) so tests can build a
// compliant answer without re-parsing the prompt.

const WORD_RULE = 'A word is any whitespace-separated token that contains at least one letter or digit.';
const SENT_RULE = 'A sentence is text ending in ".", "!" or "?" that is followed by a space, a line break, or the end of the text.';

function rules(checks: Array<[string, boolean]>, allOrNothing = false): Grade {
  const failed = checks.filter(([, ok]) => !ok).map(([k]) => k);
  const frac = (checks.length - failed.length) / checks.length;
  return {
    score: allOrNothing ? (failed.length ? 0 : 1) : frac,
    detail: failed.length ? `failed: ${failed.join(', ')}${allOrNothing ? ' (all-or-nothing)' : ''}` : `all ${checks.length} rules met`,
  };
}

export const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
export const bare = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
export const lines = (s: string) => s.replace(/\r/g, '').trim().split('\n');
// Sentences per SENT_RULE: split after a terminator that is followed by whitespace.
export const sentences = (s: string) => s.trim().split(/(?<=[.!?])\s+/).filter((c) => /[.!?]$/.test(c));
const letters = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length;
const countTok = (s: string, w: string) => words(s).filter((t) => bare(t).toLowerCase() === w.toLowerCase()).length;

function withSpec<T>(inst: SingleInstance, spec: T): SingleInstance & { spec: T } {
  return Object.assign(inst, { spec });
}

const TOPICS = ['home composting', 'learning to sail', 'remote team meetings', 'winter cycling', 'saving for a first home',
  'caring for houseplants', 'running a book club', 'backyard beekeeping', 'reducing screen time', 'planning a road trip'];
const ACROS_LONG = ['LANTERN', 'HARVEST', 'COMPASS', 'THUNDER', 'GRANITE', 'CRIMSON'];
const ACROS = ['GRIP', 'BOLD', 'CALM', 'DUSK', 'FERN', 'MOSS', 'PINE', 'SAGE', 'TIDE', 'WAVE', 'BRAVE', 'CLOUD', 'FROST', 'OCEAN', 'PRISM', 'STEEL'];

// ── 1. product copy: exact bullet length, acrostic, placed capital word ──────
export const instructProductCopy: V4Task = {
  id: 'instruct-product-copy-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const product = rng.pick(['trail running shoe', 'cast-iron skillet', 'standing desk', 'e-bike battery', 'espresso grinder']);
    const acro = rng.pick(ACROS_LONG);
    const n = acro.length;
    const W = rng.int(6, 9);
    const C = 5 + 6 * (W - 3) + 11 + rng.int(3, 8);
    const banned = rng.pick(['amazing', 'perfect', 'ultimate', 'best']);
    const upper = rng.pick(['DURABLE', 'LIGHTWEIGHT', 'QUIET', 'RUGGED', 'COMPACT']);
    const k = rng.int(1, n);
    const sku = `SKU-${rng.int(1000, 9999)}-${rng.pick(['A', 'B', 'X'])}`;
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Write product copy for a ${product}. ${WORD_RULE} Rules:\n` +
          `1. Exactly ${n} bullet lines, each starting with "- ".\n` +
          `2. Every bullet has exactly ${W} words, not counting the "- ".\n` +
          `3. The first letters of the bullets' first words, top to bottom, spell ${acro}.\n` +
          `4. Never use the word "${banned}", in any case.\n` +
          `5. The word ${upper} appears exactly once in the whole answer, in all capitals, inside bullet ${k}.\n` +
          `6. No bullet ends with a punctuation mark; each ends with a letter or digit.\n` +
          `7. Every bullet contains exactly ${C} letters (count only a-z and A-Z; spaces, digits and punctuation don't count, nor does the "- ").\n` +
          `8. The last line is exactly "${sku}".\n` +
          `9. Nothing else: no title, no intro, no blank lines.`,
      }],
      grade(res) {
        const t = res.text;
        const ls = lines(t);
        const bl = ls.filter((l) => l.startsWith('- '));
        const body = (l: string) => words(l.slice(2));
        const ups = words(t).map(bare).filter((w) => w.toLowerCase() === upper.toLowerCase());
        return rules([
          ['bullet count', bl.length === n],
          ['words per bullet', bl.length > 0 && bl.every((l) => body(l).length === W)],
          ['acrostic', bl.map((l) => (bare(body(l)[0] ?? '')[0] ?? '').toUpperCase()).join('') === acro],
          ['banned word', countTok(t, banned) === 0],
          ['capital word once in bullet', ups.length === 1 && ups[0] === upper && countTok(bl[k - 1] ?? '', upper) === 1],
          ['no end punctuation', bl.length > 0 && bl.every((l) => /[\p{L}\p{N}]$/u.test(l.trim()))],
          ['letters per bullet', bl.length > 0 && bl.every((l) => letters(l.slice(2)) === C)],
          ['last line', ls[ls.length - 1]?.trim() === sku],
          ['nothing else', ls.length === n + 1 && ls.slice(0, n).every((l) => l.startsWith('- ')) && ls.every((l) => l.trim() !== '')],
        ]);
      },
    }, { acro, W, C, banned, upper, k, sku });
  },
};

// ── 2. minified JSON with key order, a volume to hit, sorted tags ────────────
export const instructJsonSchema: V4Task = {
  id: 'instruct-json-schema-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const thing = rng.pick(['warehouse item', 'library book', 'bakery product', 'camping gear item', 'museum exhibit']);
    const id = `${rng.pick(['WH', 'LB', 'BK', 'CG', 'MX'])}-${rng.int(100, 999)}`;
    const nameWords = rng.int(2, 4);
    const d = rng.int(2, 6);
    const h = rng.int(d + 1, d + 6);
    const w = rng.int(h + 1, h + 8);
    const V = w * h * d;
    const nTags = rng.int(3, 4);
    const L = rng.int(5, 6);
    const stock = rng.pick([true, false]);
    const KEYS = ['id', 'name', 'dimensions', 'tags', 'in_stock', 'notes'];
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Return ONLY a JSON object describing a fictional ${thing}. Rules:\n` +
          `1. Output the JSON object and nothing else: no code fences, no text before or after.\n` +
          `2. Minified: one line, no spaces or line breaks anywhere except inside string values.\n` +
          `3. Exactly these keys, in this order: ${KEYS.map((x) => `"${x}"`).join(', ')}.\n` +
          `4. "id" is the string "${id}", "in_stock" is the boolean ${stock}, and "notes" is null.\n` +
          `5. "name" is a string of exactly ${nameWords} words, each written as one capital letter followed only by lowercase letters (for example "Blue Canvas").\n` +
          `6. "dimensions" is an object with exactly the keys "w", "h", "d" in that order, all positive integers, with w > h > d.\n` +
          `7. w × h × d equals exactly ${V}.\n` +
          `8. "tags" is an array of exactly ${nTags} different strings, each exactly ${L} lowercase letters a-z.\n` +
          `9. "tags" is sorted alphabetically, A to Z.\n` +
          `10. No letter appears more than once across all the tags combined.`,
      }],
      grade(res) {
        const raw = res.text.trim();
        let o: Record<string, unknown> | null = null;
        try {
          const v = JSON.parse(raw);
          if (v && typeof v === 'object' && !Array.isArray(v)) o = v;
        } catch { /* not bare JSON */ }
        const x = o ?? {};
        const dims = (x.dimensions ?? {}) as Record<string, unknown>;
        const isInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
        const tags = Array.isArray(x.tags) ? x.tags : null;
        const nm = typeof x.name === 'string' ? x.name.split(' ') : [];
        return rules([
          ['bare JSON only', o !== null],
          ['minified', o !== null && JSON.stringify(o) === raw],
          ['key order', JSON.stringify(Object.keys(x)) === JSON.stringify(KEYS)],
          ['fixed values', x.id === id && x.in_stock === stock && x.notes === null],
          ['name words', nm.length === nameWords && nm.every((p) => /^[A-Z][a-z]+$/.test(p))],
          ['dimensions shape', JSON.stringify(Object.keys(dims)) === '["w","h","d"]' && isInt(dims.w) && isInt(dims.h) && isInt(dims.d)
            && (dims.w as number) > (dims.h as number) && (dims.h as number) > (dims.d as number)],
          ['volume', (dims.w as number) * (dims.h as number) * (dims.d as number) === V],
          ['tags', tags !== null && tags.length === nTags && new Set(tags).size === nTags
            && tags.every((g) => typeof g === 'string' && new RegExp(`^[a-z]{${L}}$`).test(g))],
          ['tags sorted', tags !== null && tags.length > 0 && tags.every((g, i) => i === 0 || String(tags[i - 1]) < String(g))],
          ['no repeated letters across tags', tags !== null && tags.length > 0 && (() => { const all = tags.map(String).join(''); return new Set(all).size === all.length; })()],
        ]);
      },
    }, { id, nameWords, dims: { w, h, d }, V, nTags, L, stock, KEYS });
  },
};

// ── 3. lowercase prose: sentence count, per-sentence cap, word at a position ─
export const instructLowercase: V4Task = {
  id: 'instruct-lowercase-range-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const S = rng.int(4, 6);
    const M = rng.int(10, 14);
    const lo = S * rng.int(6, 8);
    const hi = lo + 12;
    // Every fixed word avoids the letter e, so the lipogram rule is satisfiable.
    const kw = rng.pick(['habit', 'focus', 'rhythm', 'plan', 'calm']);
    const k = rng.int(2, 3);
    const j = rng.int(2, S - 1);
    const X = rng.pick(['always', 'slowly', 'mostly', 'truly']);
    const end = rng.pick(['start small and go on', 'that is all it asks of you', 'try it for a month']);
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Write a short piece about ${topic}. ${WORD_RULE} ${SENT_RULE} Rules:\n` +
          `1. Between ${lo} and ${hi} words in total.\n` +
          `2. Exactly ${S} sentences.\n` +
          `3. Every sentence has at most ${M} words.\n` +
          `4. Only lowercase letters: no capital letters anywhere.\n` +
          `5. No commas.\n` +
          `6. The word "${kw}" appears exactly ${k} times.\n` +
          `7. The third word of sentence ${j} is "${X}".\n` +
          `8. The text ends with the exact phrase "${end}" followed by a period.\n` +
          `9. Never use the letter "e" anywhere in the text.`,
      }],
      grade(res) {
        const t = res.text.trim();
        const n = words(t).length;
        const ss = sentences(t);
        const third = bare(words(ss[j - 1] ?? '')[2] ?? '');
        return rules([
          ['word count', n >= lo && n <= hi],
          ['sentence count', ss.length === S],
          ['sentence length', ss.length > 0 && ss.every((x) => words(x).length <= M)],
          ['all lowercase', t === t.toLowerCase()],
          ['no commas', !t.includes(',')],
          ['keyword count', countTok(t, kw) === k],
          [`sentence ${j} third word`, third === X],
          ['exact ending', t.endsWith(`${end}.`)],
          ['no letter e', !/e/i.test(t)],
        ]);
      },
    }, { S, M, lo, hi, kw, k, j, X, end });
  },
};

// ── 4. numbered list: exact item length, alphabetical first words ────────────
const FIRSTS = ['Aim', 'Build', 'Check', 'Draft', 'Enjoy', 'Find', 'Gather', 'Hold', 'Invite', 'Join'];

export const instructNumberedList: V4Task = {
  id: 'instruct-numbered-list-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const n = rng.int(5, 8);
    const W = rng.int(5, 7);
    const j = rng.int(2, n);
    const w = rng.pick(['morning', 'friend', 'notebook', 'timer', 'map']);
    const C = 6 + 8 + 6 * (W - 3) + (W - 1) + 1 + rng.int(3, 8);
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Give tips on ${topic}. ${WORD_RULE} Rules:\n` +
          `1. Output exactly ${n} lines, numbered "1." to "${n}." in order, and nothing else.\n` +
          `2. Each item has exactly ${W} words, not counting its number.\n` +
          `3. Item ${j} contains the word "${w}".\n` +
          `4. No item starts with the word "The".\n` +
          `5. No digits inside the items (digits only in the numbering).\n` +
          `6. The items' first words are in strict alphabetical order (A to Z, ignoring case), so no two items start with the same word.\n` +
          `7. Every item ends with a period.\n` +
          `8. Every item is exactly ${C} characters long, counting everything after the number and its following space (letters, spaces and the final period).`,
      }],
      grade(res) {
        const ls = lines(res.text);
        const items = ls.map((l) => l.match(/^(\d+)\.\s+(.*)$/));
        const bodies = items.map((m) => m?.[2] ?? '');
        const firsts = bodies.map((b) => bare(words(b)[0] ?? '').toLowerCase());
        return rules([
          ['exactly N numbered lines', ls.length === n && items.every((m, i) => m !== null && Number(m[1]) === i + 1)],
          ['words per item', bodies.every((b) => words(b).length === W)],
          [`item ${j} word`, countTok(bodies[j - 1] ?? '', w) >= 1],
          ['no "The" start', firsts.every((f) => f !== 'the')],
          ['no digits in items', bodies.every((b) => !/\d/.test(b))],
          ['alphabetical first words', firsts.length > 0 && firsts.every((f, i) => f !== '' && (i === 0 || firsts[i - 1] < f))],
          ['period endings', bodies.every((b) => b.trim().endsWith('.'))],
          ['characters per item', bodies.length > 0 && bodies.every((b) => b.length === C)],
        ]);
      },
    }, { n, W, j, w, C, FIRSTS });
  },
};

// ── 5. sections: sentence counts per section, placed quote, closing question ─
export const instructSections: V4Task = {
  id: 'instruct-sections-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const heads = rng.pick([
      ['Overview', 'Plan', 'Risks'], ['Context', 'Proposal', 'Next Steps'], ['Why', 'How', 'What Could Go Wrong'], ['Background', 'Approach', 'Open Questions'],
    ]);
    const P = rng.int(2, 4);
    const phrase = rng.pick(['less is more', 'measure twice', 'slow and steady', 'start before you are ready']);
    const banned = rng.pick(['very', 'really', 'basically', 'simply']);
    const cap = 3 * P * 14;
    const N1 = rng.int(7, 10);
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Write a brief on ${topic}. ${WORD_RULE} ${SENT_RULE} Rules:\n` +
          `1. Use exactly these three headers, in this order, each on its own line: ${heads.map((x) => `"## ${x}"`).join(', ')}. Nothing may come before the first header.\n` +
          `2. No other lines start with "#".\n` +
          `3. Each section has exactly ${P} sentences of prose under its header.\n` +
          `4. The phrase ${phrase} appears exactly once in the whole brief, wrapped in double quotes, inside the second section.\n` +
          `5. Never use the word "${banned}".\n` +
          `6. At most ${cap} words in total, not counting header lines.\n` +
          `7. No lists: no line starts with "- ", "* " or a number followed by ". ".\n` +
          `8. The last sentence of the third section is a question ending in "?".\n` +
          `9. Every sentence in the first section has exactly ${N1} words.`,
      }],
      grade(res) {
        const ls = lines(res.text);
        const idx = heads.map((x) => ls.findIndex((l) => l.trim() === `## ${x}`));
        const ordered = idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])) && idx[0] === 0;
        const secs = ordered ? idx.map((start, i) => ls.slice(start + 1, i < 2 ? idx[i + 1] : ls.length).join(' ')) : ['', '', ''];
        const nonHeader = ls.filter((l) => !l.startsWith('#')).join(' ');
        const quoted = `"${phrase}"`;
        const occurrences = res.text.toLowerCase().split(phrase.toLowerCase()).length - 1;
        const last = sentences(secs[2]).pop() ?? '';
        return rules([
          ['headers exact, in order, first', ordered],
          ['no other headers', ls.filter((l) => l.startsWith('#')).length === 3],
          ['sentences per section', ordered && secs.every((s) => sentences(s).length === P)],
          ['quoted phrase once in section 2', occurrences === 1 && secs[1].includes(quoted)],
          ['banned word', countTok(res.text, banned) === 0],
          ['word cap', words(nonHeader).length <= cap],
          ['no lists', ls.every((l) => !/^(\s*[-*] |\s*\d+\. )/.test(l))],
          ['closing question', ordered && last.endsWith('?')],
          ['section 1 sentence length', ordered && sentences(secs[0]).length > 0 && sentences(secs[0]).every((x) => words(x).length === N1)],
        ]);
      },
    }, { heads, P, phrase, banned, cap, N1 });
  },
};

// ── 6. paragraphs: growing lengths, keyword once each, opener, closing ? ────
export const instructParagraphs: V4Task = {
  id: 'instruct-paragraphs-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const n = rng.int(3, 5);
    const k = rng.int(2, n);
    const first = rng.pick(['Consider', 'Meanwhile', 'Ultimately', 'Still', 'Honestly']);
    const S = rng.int(2, 3);
    const kw = rng.pick(['habit', 'balance', 'effort', 'rhythm']);
    const banned = rng.pick(['very', 'really', 'thing', 'stuff']);
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Write about ${topic}. ${WORD_RULE} ${SENT_RULE} Rules:\n` +
          `1. Exactly ${n} paragraphs, separated by a line containing only *** (three asterisks).\n` +
          `2. Paragraph ${k} starts with the word "${first}".\n` +
          `3. Every paragraph has exactly ${S} sentences.\n` +
          `4. Each paragraph has more words than the one before it.\n` +
          `5. Never use the word "${banned}".\n` +
          `6. The word "${kw}" appears exactly once in every paragraph.\n` +
          `7. The final paragraph ends with a question mark.\n` +
          `8. No headers and no lists.\n` +
          `9. In the second paragraph, every sentence after the first begins with the last word of the sentence before it (ignoring case and punctuation).`,
      }],
      grade(res) {
        const t = res.text.replace(/\r/g, '').trim();
        const paras = t.split(/\n[ \t]*\*\*\*[ \t]*\n/).map((p) => p.trim());
        const counts = paras.map((p) => words(p).length);
        return rules([
          ['paragraph count', paras.length === n && paras.every((p) => p !== '')],
          [`paragraph ${k} opener`, bare(words(paras[k - 1] ?? '')[0] ?? '') === first],
          ['sentences per paragraph', paras.every((p) => sentences(p).length === S)],
          ['growing lengths', counts.every((c, i) => i === 0 || c > counts[i - 1])],
          ['banned word', countTok(t, banned) === 0],
          ['keyword once per paragraph', paras.every((p) => countTok(p, kw) === 1)],
          ['closing question', t.endsWith('?')],
          ['no headers or lists', lines(t).every((l) => !/^(#|\s*[-*] |\s*\d+\. )/.test(l))],
          ['chained sentences in paragraph 2', (() => {
            const ss = sentences(paras[1] ?? '');
            return ss.length >= 2 && ss.every((x, i) => i === 0 || bare(words(x)[0] ?? '').toLowerCase() === bare(words(ss[i - 1]).pop() ?? '').toLowerCase());
          })()],
        ]);
      },
    }, { n, k, first, S, kw, banned });
  },
};

// ── 7. repeat the request, then answer under constraints (all-or-nothing) ────
export const instructRepeatRequest: V4Task = {
  id: 'instruct-repeat-request-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const S = rng.int(3, 4);
    const cap = rng.pick([45, 55, 65]);
    const kw = rng.pick(['patience', 'curiosity', 'planning', 'focus']);
    const close = rng.pick(['That is worth the effort.', 'Give it a real try.', 'The first step is the hardest.']);
    const request = `Explain why ${topic} is worth trying in exactly ${S} sentences and at most ${cap} words, using the word "${kw}" exactly twice, never using the word "very", exactly one word of 10 or more letters, and ending with "${close}"`;
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `First repeat the request below word for word, exactly as written, as the first line of your answer. Then leave one blank line. Then answer it. ` +
          `Add nothing before the repeated request and nothing after your answer. ${WORD_RULE} ${SENT_RULE} This task is scored all-or-nothing.\n\n${request}`,
      }],
      grade(res) {
        const ls = res.text.replace(/\r/g, '').trim().split('\n');
        const answer = ls.slice(2).join('\n').trim();
        return rules([
          ['request repeated exactly on line 1', ls[0]?.trim() === request],
          ['one blank line then the answer', ls[1]?.trim() === '' && (ls[2] ?? '').trim() !== ''],
          ['answer sentence count', sentences(answer).length === S],
          ['answer word cap', words(answer).length <= cap],
          ['keyword exactly twice', countTok(answer, kw) === 2],
          ['no "very"', countTok(answer, 'very') === 0],
          ['exact closing', answer.endsWith(close)],
          ['exactly one 10+ letter word', words(answer).filter((x) => letters(bare(x)) >= 10).length === 1],
        ], true);
      },
    }, { request, S, cap, kw, close });
  },
};

// ── 8. CSV: arithmetic column, a quantity total to hit, sort by total ───────
export const instructCsv: V4Task = {
  id: 'instruct-csv-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const header = 'item,qty,unit_price,total,region';
    const N = rng.int(4, 6);
    const L = 5;
    const lo = rng.int(1, 5);
    const hi = lo + rng.int(10, 20);
    const qtys = Array.from({ length: N }, () => rng.int(lo, hi));
    const Q = qtys.reduce((a, b) => a + b, 0);
    const prices = qtys.map(() => rng.int(100, 5000));
    const T = qtys.reduce((a, q, i) => a + q * prices[i], 0);
    const money = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
    const REGIONS = ['north', 'south', 'east', 'west'];
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Output a CSV of fictional stock lines. Rules:\n` +
          `1. The first line is exactly: ${header}\n` +
          `2. Then exactly ${N} data rows, each with exactly 5 comma-separated fields, and nothing else (no blank lines).\n` +
          `3. item: a different value in every row, exactly ${L} lowercase letters a-z.\n` +
          `4. qty: an integer from ${lo} to ${hi}.\n` +
          `5. The qty values add up to exactly ${Q}.\n` +
          `6. unit_price: a number with exactly two decimal places, from 1.00 to 50.00.\n` +
          `7. total: exactly qty × unit_price, written with exactly two decimal places.\n` +
          `8. region: one of ${REGIONS.join(', ')}.\n` +
          `9. Rows are sorted by total, largest first; equal totals are ordered by item, A to Z.\n` +
          `10. No quotes and no spaces anywhere.\n` +
          `11. The totals add up to exactly ${money(T)}.`,
      }],
      grade(res) {
        const ls = res.text.replace(/\r/g, '').trim().split('\n');
        const rows = ls.slice(1).map((l) => l.split(','));
        const shaped = rows.length === N && rows.every((r) => r.length === 5);
        const cents = (s: string) => (/^\d+\.\d{2}$/.test(s) ? Math.round(Number(s) * 100) : NaN);
        const qty = rows.map((r) => (/^\d+$/.test(r[1] ?? '') ? Number(r[1]) : NaN));
        const totals = rows.map((r) => cents(r[3] ?? ''));
        return rules([
          ['header', ls[0] === header],
          ['row count and width', shaped && ls.every((l) => l.trim() !== '')],
          ['item keys', shaped && new Set(rows.map((r) => r[0])).size === N && rows.every((r) => new RegExp(`^[a-z]{${L}}$`).test(r[0]))],
          ['qty range', shaped && qty.every((q) => Number.isInteger(q) && q >= lo && q <= hi)],
          ['qty sum', shaped && qty.reduce((a, b) => a + b, 0) === Q],
          ['unit price', shaped && rows.every((r) => { const c = cents(r[2]); return c >= 100 && c <= 5000; })],
          ['total arithmetic', shaped && rows.every((r, i) => totals[i] === qty[i] * cents(r[2]))],
          ['region', shaped && rows.every((r) => REGIONS.includes(r[4]))],
          ['sorted by total', shaped && rows.every((r, i) => i === 0 || totals[i - 1] > totals[i] || (totals[i - 1] === totals[i] && rows[i - 1][0] < r[0]))],
          ['no quotes or spaces', !/["' ]/.test(ls.join('\n'))],
          ['totals sum', shaped && totals.every((x) => !Number.isNaN(x)) && totals.reduce((a, b) => a + b, 0) === T],
        ]);
      },
    }, { header, N, L, lo, hi, qtys, Q, prices, T, REGIONS });
  },
};

// ── 9. all-caps notice: titled, acrostic lines, bounded line lengths ────────
export const instructUppercaseNotice: V4Task = {
  id: 'instruct-uppercase-notice-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(['a building water shutdown', 'a parking lot repaving', 'a fire alarm test', 'an elevator upgrade']);
    const T = rng.int(2, 4);
    const acro = rng.pick(ACROS.filter((a) => a.length <= 5));
    const kw = rng.pick(['WATER', 'ACCESS', 'NOTICE', 'SAFETY']);
    const k = rng.int(2, 3);
    const a = rng.int(4, 6);
    const b = a + rng.int(4, 6);
    const C = 7 * a - 7 + rng.int(3, 8);
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Write a tenant notice about ${topic}. ${WORD_RULE} Rules:\n` +
          `1. The first line is a title wrapped in double angle brackets, like <<LIKE THIS>>, with exactly ${T} words inside.\n` +
          `2. After the title, exactly ${acro.length} more lines, and no blank lines anywhere.\n` +
          `3. The first letters of those ${acro.length} lines, top to bottom, spell ${acro}.\n` +
          `4. Everything is in capital letters: no lowercase letters anywhere.\n` +
          `5. The word ${kw} appears exactly ${k} times in total, title included.\n` +
          `6. No exclamation marks.\n` +
          `7. Each line after the title has between ${a} and ${b} words.\n` +
          `8. The last line ends with "END OF NOTICE".\n` +
          `9. Every line after the title is exactly ${C} characters long, counting spaces.`,
      }],
      grade(res) {
        const t = res.text.replace(/\r/g, '').trim();
        const ls = t.split('\n');
        const title = ls[0]?.match(/^<<(.+)>>$/);
        const body = ls.slice(1);
        return rules([
          ['title', title !== null && words(title[1]).length === T],
          ['line count', body.length === acro.length && ls.every((l) => l.trim() !== '')],
          ['acrostic', body.map((l) => l.trim()[0] ?? '').join('') === acro],
          ['all capitals', t === t.toUpperCase()],
          ['keyword count', countTok(t, kw) === k],
          ['no exclamation marks', !t.includes('!')],
          ['line lengths', body.length > 0 && body.every((l) => { const n = words(l).length; return n >= a && n <= b; })],
          ['closing', (body[body.length - 1] ?? '').trim().endsWith('END OF NOTICE')],
          ['characters per line', body.length > 0 && body.every((l) => l.length === C)],
        ]);
      },
    }, { T, acro, kw, k, a, b, C });
  },
};

// ── 10. bullets with alternating endings, highlights, P.S. (all-or-nothing) ─
export const instructPostscript: V4Task = {
  id: 'instruct-postscript-1',
  suite: 'instruct',
  difficulty: 3,
  build(rng) {
    const topic = rng.pick(TOPICS);
    const N = rng.int(4, 6);
    const h = rng.int(2, 3);
    const banned = rng.pick(['easy', 'simple', 'just', 'obviously']);
    const W = rng.int(6, 9);
    const cap = N * 14 + 12;
    return withSpec({
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `Give advice on ${topic}. ${WORD_RULE} This task is scored all-or-nothing. Rules:\n` +
          `1. Start with exactly ${N} bullet lines, each starting with "* " (asterisk, space).\n` +
          `2. After the bullets, exactly one more line, starting with "P.S.". Nothing else: no intro, no blank lines.\n` +
          `3. Exactly ${h} highlighted phrases in total, each wrapped in single asterisks *like this*, and each exactly two words.\n` +
          `4. Odd-numbered bullets (1st, 3rd, ...) end with "?"; even-numbered bullets end with ".".\n` +
          `5. No digits anywhere.\n` +
          `6. Never use the word "${banned}".\n` +
          `7. At most ${cap} words in total.\n` +
          `8. Every bullet has exactly ${W} words, not counting the "* ".`,
      }],
      grade(res) {
        const t = res.text.replace(/\r/g, '').trim();
        const ls = t.split('\n');
        const bl = ls.slice(0, N);
        const inner = bl.map((l) => l.slice(2)).join('\n') + '\n' + (ls[N] ?? '');
        const hl = [...inner.matchAll(/\*([^*\n]+)\*/g)].map((m) => m[1]);
        return rules([
          ['bullets first', bl.length === N && bl.every((l) => l.startsWith('* '))],
          ['one P.S. line, nothing else', ls.length === N + 1 && (ls[N] ?? '').startsWith('P.S.') && ls.every((l) => l.trim() !== '')],
          ['highlights', hl.length === h && hl.every((x) => words(x).length === 2)],
          ['alternating endings', bl.length === N && bl.every((l, i) => l.trim().endsWith(i % 2 === 0 ? '?' : '.'))],
          ['no digits', !/\d/.test(t)],
          ['banned word', countTok(t, banned) === 0],
          ['word cap', words(t).length <= cap],
          ['words per bullet', bl.length === N && bl.every((l) => words(l.slice(2)).length === W)],
        ], true);
      },
    }, { N, h, banned, cap, W });
  },
};

// Some rules hold vacuously on empty text ("no bullet ends with punctuation"), so
// an empty answer would earn partial credit. It scores 0 instead.
function noCreditForEmpty(task: V4Task): V4Task {
  return {
    ...task,
    build(rng) {
      const inst = task.build(rng) as SingleInstance;
      const grade = inst.grade.bind(inst);
      inst.grade = (res, ctx) => (res.text.trim() ? grade(res, ctx) : { score: 0, detail: 'empty answer' });
      return inst;
    },
  };
}

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
].map(noCreditForEmpty);
