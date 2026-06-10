import type { HardwareBoardRow, Model } from "./types";

/**
 * Deterministic "popular matchups": adjacent ranks are natural rivalries,
 * plus the top model of each provider against the next provider's champion.
 * Used by the homepage strip and the sitemap, so the pages Google lands on
 * are the same ones users see.
 */
export function modelMatchups(models: Model[], max = 8): [Model, Model][] {
  const pairs: [Model, Model][] = [];
  const seen = new Set<string>();
  const add = (a?: Model, b?: Model) => {
    if (!a || !b || a.slug === b.slug) return;
    const key = [a.slug, b.slug].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a, b]);
  };

  for (let i = 0; i + 1 < Math.min(models.length, 6); i++) {
    add(models[i], models[i + 1]);
  }

  const champs: Model[] = [];
  const providers = new Set<string>();
  for (const m of models) {
    if (!providers.has(m.provider)) {
      providers.add(m.provider);
      champs.push(m);
    }
    if (champs.length >= 5) break;
  }
  for (let i = 0; i + 1 < champs.length; i++) add(champs[i], champs[i + 1]);

  return pairs.slice(0, max);
}

/** Adjacent-rank rig rivalries; lab duplicates excluded. */
export function rigMatchups(
  rows: HardwareBoardRow[],
  max = 4
): [HardwareBoardRow, HardwareBoardRow][] {
  const eligible = rows.filter((r) => !r.tag.startsWith("lab-"));
  const pairs: [HardwareBoardRow, HardwareBoardRow][] = [];
  for (let i = 0; i + 1 < eligible.length && pairs.length < max; i++) {
    pairs.push([eligible[i], eligible[i + 1]]);
  }
  return pairs;
}
