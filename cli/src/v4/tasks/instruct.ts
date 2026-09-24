import type { V4Task } from '../types.js';

// IFEval-style: every constraint is machine-checkable, and each one counts.
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
        const lines = res.text.replace(/\r/g, '').trim().split('\n');
        const bulletLines = lines.filter((l) => l.startsWith('- '));
        const words = (l: string) => l.slice(2).trim().split(/\s+/).filter(Boolean).length;
        const checks: Array<[string, boolean]> = [
          ['bullet count', bulletLines.length === bullets],
          ['bullet length', bulletLines.length > 0 && bulletLines.every((l) => words(l) <= maxWords)],
          ['banned word', !new RegExp(`\\b${banned}\\b`, 'i').test(res.text)],
          ['caps word once', (() => {
            const all = res.text.match(new RegExp(`\\b${upper}\\b`, 'gi')) ?? [];
            return all.length === 1 && all[0] === upper;
          })()],
          ['last line', lines[lines.length - 1]?.trim() === sku],
          ['nothing else', lines.length === bullets + 1 && lines.every((l) => l.trim() !== '')],
        ];
        const passed = checks.filter(([, ok]) => ok).length;
        const failed = checks.filter(([, ok]) => !ok).map(([k]) => k);
        return { score: passed / checks.length, detail: failed.length ? `failed: ${failed.join(', ')}` : 'all 6 rules met' };
      },
    };
  },
};
