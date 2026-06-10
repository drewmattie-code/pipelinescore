import type { CategoryScores } from "./types";
import { PROFILES, PROFILE_WEIGHTS, type ProfileId } from "./tiers";

// Plain-language names for verdict sentences (lowercase, mid-sentence).
const NAMES: Record<keyof CategoryScores, string> = {
  code: "code",
  reason: "reasoning",
  tool_use: "tool use",
  rag: "RAG",
  speed: "throughput",
};

export function bestProfileFor(scores: CategoryScores): ProfileId {
  let best: ProfileId = "balanced";
  let bestVal = -1;
  for (const p of PROFILES) {
    const w = PROFILE_WEIGHTS[p.id];
    let total = 0;
    for (const [cat, weight] of Object.entries(w)) {
      total += weight * (scores[cat as keyof CategoryScores] ?? 0);
    }
    if (total > bestVal) {
      bestVal = total;
      best = p.id;
    }
  }
  return best;
}

/**
 * One blunt, deterministic sentence about a score line. No LLM: strongest
 * category, weakest category, and which weighting profile flatters it most.
 */
export function verdictFor(scores: CategoryScores): string {
  const entries = Object.entries(scores) as [keyof CategoryScores, number][];
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const [strongCat, strongVal] = sorted[0];
  const [weakCat, weakVal] = sorted[sorted.length - 1];
  const profile = PROFILES.find((p) => p.id === bestProfileFor(scores))?.label ?? "Balanced";

  if (strongVal - weakVal < 8) {
    return `An even spread: no standout, no liability (${weakVal.toFixed(0)} to ${strongVal.toFixed(0)} across all five categories). Best-fit profile: ${profile}.`;
  }
  const strong = NAMES[strongCat];
  return `${strong.charAt(0).toUpperCase()}${strong.slice(1)} is the headline (${strongVal.toFixed(1)}); ${NAMES[weakCat]} is the soft spot (${weakVal.toFixed(1)}). Best-fit profile: ${profile}.`;
}
