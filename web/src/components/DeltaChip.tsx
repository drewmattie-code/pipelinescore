/** Signed point-difference chip: green when ahead, red when behind. */
export function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return <span className="w-12 shrink-0" />;
  const ahead = delta > 0;
  return (
    <span
      className={`shrink-0 w-12 text-center font-mono tabular-nums text-[11px] font-bold px-1 py-0.5 rounded ${
        ahead
          ? "text-[var(--color-emerald)] bg-[color:var(--color-emerald)]/10"
          : "text-[var(--color-red)] bg-[color:var(--color-red)]/10"
      }`}
    >
      {ahead ? "+" : ""}
      {delta.toFixed(1)}
    </span>
  );
}
