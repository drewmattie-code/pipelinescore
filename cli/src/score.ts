import type { Category, RunSummary, TaskResult, Taxonomy } from './types.js';

export function computeCategoryScores(
  results: TaskResult[],
  taxonomy: Taxonomy,
): Record<string, number> {
  const buckets = new Map<string, number[]>();
  for (const r of results) {
    if (!buckets.has(r.category)) buckets.set(r.category, []);
    buckets.get(r.category)!.push(r.raw_score);
  }
  const out: Record<string, number> = {};
  for (const cat of Object.keys(taxonomy.weights)) {
    if (cat === 'speed') continue;
    const arr = buckets.get(cat) ?? [];
    if (arr.length === 0) {
      out[cat] = 0;
    } else {
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      out[cat] = +(mean * 10).toFixed(2); // 0-10 → 0-100
    }
  }
  // Speed: derived from p50 latency. 0ms → 100, every 100ms drops 1 point.
  const latencies = results.map((r) => r.latency_ms).filter((l) => l > 0).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0;
  const speed = Math.max(0, Math.min(100, 100 - p50 / 100));
  out.speed = +speed.toFixed(2);
  return out;
}

export function computePipelineScore(
  categoryScores: Record<string, number>,
  taxonomy: Taxonomy,
): number {
  let total = 0;
  let weightSum = 0;
  for (const [cat, w] of Object.entries(taxonomy.weights)) {
    const s = categoryScores[cat];
    if (typeof s !== 'number' || isNaN(s)) continue;
    total += s * w;
    weightSum += w;
  }
  if (weightSum === 0) return 0;
  // Normalize in case some categories are missing (e.g. no judge → no rubric scores).
  return +(total / weightSum).toFixed(2);
}

export function determineTier(score: number, taxonomy: Taxonomy): { id: string; name: string; color: string } {
  for (const t of taxonomy.tiers) {
    if (score >= t.min && score <= t.max) return { id: t.id, name: t.name, color: t.color };
  }
  return { id: 'drip', name: 'DRIP', color: '#98989D' };
}
