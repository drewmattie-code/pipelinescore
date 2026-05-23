import type { Tier, TierId } from "./types";

export const TIERS: Tier[] = [
  { id: "trunk", name: "TRUNK", min: 90, max: 100, color: "#0F766E" },
  { id: "mainline", name: "MAINLINE", min: 75, max: 89, color: "#0071E3" },
  { id: "feeder", name: "FEEDER", min: 60, max: 74, color: "#FF9F0A" },
  { id: "tap", name: "TAP", min: 40, max: 59, color: "#FF7B30" },
  { id: "drip", name: "DRIP", min: 0, max: 39, color: "#98989D" },
];

export const TIER_BY_ID: Record<TierId, Tier> = Object.fromEntries(
  TIERS.map((t) => [t.id, t])
) as Record<TierId, Tier>;

export function tierForScore(score: number): TierId {
  for (const t of TIERS) {
    if (score >= t.min && score <= t.max) return t.id;
  }
  return "drip";
}

export const CATEGORY_WEIGHTS = {
  code: 0.25,
  reason: 0.2,
  write: 0.15,
  tool_use: 0.15,
  rag: 0.12,
  speed: 0.13,
} as const;

export const CATEGORY_LABELS: Record<keyof typeof CATEGORY_WEIGHTS, string> = {
  code: "Code",
  reason: "Reason",
  write: "Write",
  tool_use: "Tool Use",
  rag: "RAG",
  speed: "Speed",
};
