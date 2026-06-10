// v2 scoring engine, server side. Mirrors cli/src/score.ts so the backend can
// recompute the authoritative score (deterministic results from the client +
// rubric results graded server-side). Kept in sync with the CLI engine by hand.

export interface ScoreInput {
  category: string;
  raw_score: number; // 0-10
  score_stddev?: number; // within-task judge spread, 0-10 (rubric self-consistency)
  latency_ms: number;
  tokens_out?: number | null;
}

export interface ScoreTaxonomy {
  categories?: string[];
  weights: Record<string, number>;
  profiles?: Record<string, Record<string, number>>;
  default_profile?: string;
  speed?: { tps_target: number; min_samples: number };
  tiers: Array<{ id: string; name: string; min: number; max: number; color: string }>;
}

export interface CategoryScore {
  mean: number;
  ci_low: number;
  ci_high: number;
  stddev: number;
  n: number;
}
export interface SpeedDetail {
  scored: boolean;
  tps_p50: number | null;
  speed_score: number | null;
  samples: number;
}
export interface ScoreV2 {
  profile: string;
  pipeline_score: number;
  pipeline_ci_low: number;
  pipeline_ci_high: number;
  tier: string;
  category_scores: Record<string, number>;
  category_detail: Record<string, CategoryScore>;
  profile_scores: Record<string, number>;
  speed: SpeedDetail;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (xs.length - 1);
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const T95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12,
  17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064,
  25: 2.06, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};
function t95(df: number): number {
  if (df <= 0) return T95[1];
  return T95[df] ?? 1.96;
}
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const round2 = (x: number) => +x.toFixed(2);

interface TaskPoint { x: number; withinStd: number }

function categoryScore(points: TaskPoint[]): CategoryScore & { se: number } {
  const n = points.length;
  if (n === 0) return { mean: 0, ci_low: 0, ci_high: 0, stddev: 0, n: 0, se: 0 };
  const xs = points.map((p) => p.x);
  const m = mean(xs);
  const acrossVar = sampleVariance(xs);
  const withinVar = mean(points.map((p) => p.withinStd * p.withinStd));
  let se: number;
  let h: number;
  if (n < 2) {
    se = points[0].withinStd;
    h = se > 0 ? t95(1) * se : 20;
  } else {
    se = Math.sqrt((acrossVar + withinVar) / n);
    h = t95(n - 1) * se;
  }
  return { mean: round2(m), ci_low: round2(clamp(m - h)), ci_high: round2(clamp(m + h)), stddev: round2(Math.sqrt(acrossVar)), n, se };
}

function speedScore(results: ScoreInput[], taxonomy: ScoreTaxonomy): SpeedDetail {
  const target = taxonomy.speed?.tps_target ?? 100;
  const minSamples = taxonomy.speed?.min_samples ?? 3;
  const tps = results
    .filter((r) => (r.tokens_out ?? 0) > 0 && r.latency_ms > 0)
    .map((r) => (r.tokens_out as number) / (r.latency_ms / 1000));
  if (tps.length < minSamples) return { scored: false, tps_p50: null, speed_score: null, samples: tps.length };
  const p50 = median(tps);
  return { scored: true, tps_p50: round2(p50), speed_score: round2(clamp((100 * p50) / target)), samples: tps.length };
}

function profileMap(taxonomy: ScoreTaxonomy): Record<string, Record<string, number>> {
  return taxonomy.profiles ?? { balanced: taxonomy.weights };
}

function composite(catPoints: Record<string, number>, catSe: Record<string, number>, speed: SpeedDetail, weights: Record<string, number>): { score: number; se: number } {
  let total = 0;
  let seSq = 0;
  let W = 0;
  for (const [cat, w] of Object.entries(weights)) {
    let s: number | undefined;
    let se = 0;
    if (cat === 'speed') {
      if (!speed.scored || speed.speed_score == null) continue;
      s = speed.speed_score;
    } else {
      s = catPoints[cat];
      se = catSe[cat] ?? 0;
      if (s === undefined) continue;
    }
    total += w * s;
    W += w;
    seSq += w * w * se * se;
  }
  if (W === 0) return { score: 0, se: 0 };
  return { score: total / W, se: Math.sqrt(seSq) / W };
}

export function determineTier(score: number, taxonomy: ScoreTaxonomy): string {
  for (const t of taxonomy.tiers) if (score >= t.min && score <= t.max) return t.id;
  return 'drip';
}

export function scoreRun(results: ScoreInput[], taxonomy: ScoreTaxonomy, profile?: string): ScoreV2 {
  const categories = taxonomy.categories ?? Object.keys(taxonomy.weights).filter((c) => c !== 'speed');
  const byCat = new Map<string, TaskPoint[]>();
  for (const r of results) {
    if (Number.isNaN(r.raw_score)) continue;
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push({ x: clamp(r.raw_score * 10), withinStd: (r.score_stddev ?? 0) * 10 });
  }
  const category_detail: Record<string, CategoryScore> = {};
  const category_scores: Record<string, number> = {};
  const catSe: Record<string, number> = {};
  for (const cat of categories) {
    const pts = byCat.get(cat);
    if (!pts || pts.length === 0) continue;
    const { se, ...detail } = categoryScore(pts);
    category_detail[cat] = detail;
    category_scores[cat] = detail.mean;
    catSe[cat] = se;
  }
  const speed = speedScore(results, taxonomy);
  const profiles = profileMap(taxonomy);
  const selected = profile ?? taxonomy.default_profile ?? 'balanced';
  const profile_scores: Record<string, number> = {};
  for (const [name, weights] of Object.entries(profiles)) {
    profile_scores[name] = round2(composite(category_scores, catSe, speed, weights).score);
  }
  const selWeights = profiles[selected] ?? profiles.balanced ?? taxonomy.weights;
  const sel = composite(category_scores, catSe, speed, selWeights);
  const h = 1.96 * sel.se;
  const point = round2(sel.score);
  return {
    profile: selected,
    pipeline_score: point,
    pipeline_ci_low: round2(clamp(point - h)),
    pipeline_ci_high: round2(clamp(point + h)),
    tier: determineTier(point, taxonomy),
    category_scores,
    category_detail,
    profile_scores,
    speed,
  };
}
