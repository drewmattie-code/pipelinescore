// ⭐ Beta #N — permanent badge for the first 50 nicknames that submitted a
// real (non-seed) benchmark run. Renders inline next to a nickname or as a
// standalone hero element on a user dashboard.

interface Props {
  rank: number | null | undefined;
  size?: "sm" | "md" | "lg";
}

export function BetaBadge({ rank, size = "sm" }: Props) {
  if (!rank) return null;

  const sizeClass =
    size === "lg"
      ? "text-xs px-3 py-1 gap-1.5"
      : size === "md"
        ? "text-[11px] px-2.5 py-0.5 gap-1"
        : "text-[10px] px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full bg-[var(--color-emerald)] text-white font-semibold tracking-wider uppercase ${sizeClass}`}
      title={`First 50 Beta Tester — submitted #${rank} of the first real PipelineScore runs`}
    >
      <span aria-hidden>★</span>
      <span>Beta #{rank}</span>
    </span>
  );
}
