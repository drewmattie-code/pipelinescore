import { TIER_BY_ID, tierForScore } from "@/lib/tiers";

/**
 * The signature in-cell percentile bar: a 0-100 score as a tier-colored fill
 * with the value beside it in tabular mono. `strong` is for the headline
 * (composite) column — full-opacity fill, bold colored number.
 */
export function BenchBar({
  value,
  strong = false,
}: {
  value: number;
  strong?: boolean;
}) {
  const color = TIER_BY_ID[tierForScore(value)].color;
  const width = Math.max(2, Math.min(100, value));
  return (
    <div className={`flex items-center gap-2 ${strong ? "min-w-[110px]" : "min-w-[88px]"}`}>
      <div
        className={`relative flex-1 ${strong ? "h-[15px]" : "h-[11px]"} rounded-[3px] bg-[var(--color-line-2)] overflow-hidden`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-[3px]"
          style={{ width: `${width}%`, backgroundColor: color, opacity: strong ? 1 : 0.75 }}
        />
      </div>
      <span
        className={`font-mono tabular-nums text-right ${
          strong ? "text-sm font-bold w-11" : "text-xs w-10 text-[var(--color-ink-2)]"
        }`}
        style={strong ? { color } : undefined}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}
