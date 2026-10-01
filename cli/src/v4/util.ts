// Pull the code out of a model answer: the last fenced block wins (models often
// show a usage example first), else the whole text.
export function extractCode(text: string): string {
  const blocks = [...text.matchAll(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];
  return text.trim();
}

export function finalLine(text: string): string {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

// Canonical JSON for comparing tool arguments: sorted keys, numeric strings left alone.
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function pyLiteral(v: unknown): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (Array.isArray(v)) return `[${v.map(pyLiteral).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v as object).map(([k, x]) => `${JSON.stringify(k)}: ${pyLiteral(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}
