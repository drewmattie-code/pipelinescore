import boxen from 'boxen';
import chalk from 'chalk';
import type { Taxonomy } from './types.js';

const CATEGORY_LABEL: Record<string, string> = {
  code: 'Code    ',
  reason: 'Reason  ',
  write: 'Write   ',
  tool_use: 'Tool Use',
  rag: 'RAG     ',
  speed: 'Speed   ',
};

function bar(value: number, width = 10): string {
  const v = Math.max(0, Math.min(100, value));
  const filled = Math.round((v / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function tierColor(tierId: string): (s: string) => string {
  switch (tierId) {
    case 'trunk':    return chalk.hex('#0F766E').bold;
    case 'mainline': return chalk.hex('#0071E3').bold;
    case 'feeder':   return chalk.hex('#FF9F0A').bold;
    case 'tap':      return chalk.hex('#FF7B30').bold;
    case 'drip':     return chalk.hex('#98989D').bold;
    default:         return chalk.bold;
  }
}

export function renderCard(opts: {
  score: number;
  tier: { id: string; name: string; color: string };
  model: string;
  categoryScores: Record<string, number>;
  taxonomy: Taxonomy;
  shareUrl?: string;
}): string {
  const headline = `${chalk.bold('PipelineScore:')} ${chalk.bold(opts.score.toFixed(1))} — ${tierColor(opts.tier.id)(opts.tier.name)}`;
  const modelLine = `${chalk.dim('Model:')} ${opts.model}`;
  const sep = '';

  const catLines = Object.keys(opts.taxonomy.weights).map((cat) => {
    const v = opts.categoryScores[cat] ?? 0;
    const label = CATEGORY_LABEL[cat] ?? cat.padEnd(8);
    return `${label} ${bar(v)}  ${v.toFixed(1).padStart(5)}`;
  });

  const share = opts.shareUrl ? `${chalk.dim('View card:')} ${chalk.cyan(opts.shareUrl)}` : '';

  const body = [headline, modelLine, sep, ...catLines, sep, share].filter((l) => l !== '' || true).join('\n');

  return boxen(body, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: opts.tier.color || 'cyan',
  });
}
