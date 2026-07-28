import Link from "next/link";
import { DataUnavailable } from "@/components/DataUnavailable";
import { getHardwareBoard } from "@/lib/api";
import { priceFor } from "@/lib/rigPrices";
import { HardwareTable, type HardwareTableRow } from "@/components/HardwareTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hardware Board",
  description:
    "Every rig ranked by its best PipelineScore — Apple Silicon vs consumer GPUs vs datacenter cards vs CPU-only, with score-per-dollar value ranking. The hardware-aware LLM leaderboard.",
};

export default async function HardwareBoardPage() {
  const board = await getHardwareBoard();
  const totalRuns = board.reduce((s, r) => s + r.runs, 0);

  // Value = score per dollar, normalized so the best-value rig reads 100.
  const priced = board.map((r) => {
    const price = priceFor(r.tag);
    return { ...r, price, spd: price ? r.bestScore / price : undefined };
  });
  const maxSpd = Math.max(...priced.map((r) => r.spd ?? 0), 0);
  const rows: HardwareTableRow[] = priced.map(({ spd, ...r }) => ({
    ...r,
    value:
      spd !== undefined && maxSpd > 0
        ? Math.round((spd / maxSpd) * 1000) / 10
        : undefined,
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
      <div className="max-w-3xl mb-8">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          Hardware Board
        </span>
        <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
          Rank the rigs.
        </h1>
        <p className="text-lg text-[var(--color-ink-2)] mt-4 leading-relaxed">
          {board.length.toLocaleString()} hardware tag{board.length === 1 ? "" : "s"} from{" "}
          {totalRuns.toLocaleString()} tagged runs, each ranked by the best
          score anyone has posted on that rig. Same testpack everywhere — the
          hardware is the variable. Sort by value to see score per dollar.
        </p>
        <div className="mt-4 text-sm text-[var(--color-ink-3)]">
          Your rig missing?{" "}
          <Link href="/run" className="underline hover:text-[var(--color-emerald)]">
            Run the CLI
          </Link>{" "}
          with <span className="font-mono">--hardware-tag</span> and put it on
          the board.
        </div>
      </div>

      {board.length === 0 ? (
        <DataUnavailable eyebrow="Hardware board" subject="The rig board" inline />
      ) : (
        <HardwareTable rows={rows} />
      )}

      <p className="mt-4 text-xs text-[var(--color-ink-3)] leading-relaxed max-w-2xl">
        Click a hardware tag to see every run on that rig; tick two rigs to go
        head-to-head. A rig&apos;s rank reflects its best showing, so it
        rewards the best model the hardware can hold. Value is score per
        dollar (best rig = 100) using hand-maintained street-price
        approximations in USD; cloud and unpriced rigs are excluded from the
        value ranking.
      </p>

      <div className="mt-12 flex items-center gap-6 text-sm">
        <Link
          href="/leaderboard"
          className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)] underline"
        >
          ← Model board
        </Link>
        <Link
          href="/leaderboard/users"
          className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)] underline"
        >
          Users board →
        </Link>
      </div>
    </div>
  );
}
