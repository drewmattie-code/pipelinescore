import { TIER_BY_ID, tierForScore } from "@/lib/tiers";

type Size = "md" | "lg" | "xl";

const SIZE_CLASSES: Record<Size, string> = {
  md: "text-2xl",
  lg: "text-5xl",
  xl: "text-8xl md:text-9xl",
};

export function ScoreNumber({
  score,
  size = "md",
  colored = true,
}: {
  score: number;
  size?: Size;
  colored?: boolean;
}) {
  const tier = tierForScore(score);
  const color = colored ? TIER_BY_ID[tier].color : undefined;
  return (
    <span
      className={`font-mono font-semibold tabular-nums leading-none ${SIZE_CLASSES[size]}`}
      style={color ? { color } : undefined}
    >
      {score.toFixed(1)}
    </span>
  );
}
