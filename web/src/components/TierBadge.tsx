import { TIER_BY_ID } from "@/lib/tiers";
import type { TierId } from "@/lib/types";

type Size = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-2 py-0.5 text-[10px] tracking-[0.14em]",
  md: "px-2.5 py-1 text-xs tracking-[0.16em]",
  lg: "px-3.5 py-1.5 text-sm tracking-[0.18em]",
};

export function TierBadge({
  tier,
  size = "md",
}: {
  tier: TierId;
  size?: Size;
}) {
  const t = TIER_BY_ID[tier];
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold uppercase rounded-full ${SIZE_CLASSES[size]}`}
      style={{
        backgroundColor: `${t.color}14`,
        color: t.color,
        border: `1px solid ${t.color}33`,
      }}
    >
      {t.name}
    </span>
  );
}
