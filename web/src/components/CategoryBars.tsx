import { CATEGORY_LABELS, TIER_BY_ID, tierForScore } from "@/lib/tiers";
import type { CategoryScores } from "@/lib/types";

const CATEGORIES = ["code", "reason", "tool_use", "rag", "speed"] as const;

export function CategoryBars({
  scores,
  compact = false,
}: {
  scores: CategoryScores;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-3"}`}>
      {CATEGORIES.map((c) => {
        const v = scores[c];
        const tier = tierForScore(v);
        const color = TIER_BY_ID[tier].color;
        return (
          <div key={c} className="flex items-center gap-3">
            <div
              className={`${compact ? "w-14 text-[10px]" : "w-20 text-xs"} text-[var(--color-ink-2)] font-medium uppercase tracking-wider`}
            >
              {CATEGORY_LABELS[c]}
            </div>
            <div className={`flex-1 ${compact ? "h-1.5" : "h-2"} bg-[var(--color-line-2)] rounded-full overflow-hidden`}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${v}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <div
              className={`font-mono tabular-nums ${compact ? "w-10 text-[11px]" : "w-12 text-xs"} text-right text-[var(--color-ink)]`}
            >
              {v.toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Mini-bars rendered horizontally, no labels — for inline leaderboard cells.
export function CategoryBarsInline({ scores }: { scores: CategoryScores }) {
  return (
    <div className="flex items-end gap-0.5 h-6">
      {CATEGORIES.map((c) => {
        const v = scores[c];
        const color = TIER_BY_ID[tierForScore(v)].color;
        return (
          <div
            key={c}
            className="w-1.5 rounded-sm"
            style={{
              height: `${Math.max(8, v)}%`,
              backgroundColor: color,
            }}
            title={`${CATEGORY_LABELS[c]} ${v.toFixed(1)}`}
          />
        );
      })}
    </div>
  );
}
