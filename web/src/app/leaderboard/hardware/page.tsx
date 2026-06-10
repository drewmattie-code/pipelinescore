import Link from "next/link";
import { getHardwareBoard } from "@/lib/api";
import { BenchBar } from "@/components/BenchBar";
import { TierBadge } from "@/components/TierBadge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hardware Board",
  description:
    "Every rig ranked by its best PipelineScore — Apple Silicon vs consumer GPUs vs datacenter cards vs CPU-only. The hardware-aware LLM leaderboard.",
};

export default async function HardwareBoardPage() {
  const rows = await getHardwareBoard();
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0);

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
          {rows.length.toLocaleString()} hardware tag{rows.length === 1 ? "" : "s"} from{" "}
          {totalRuns.toLocaleString()} tagged runs, each ranked by the best
          score anyone has posted on that rig. Same testpack everywhere — the
          hardware is the variable.
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

      <div className="overflow-x-auto -mx-4 md:mx-0 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">
              <th className="text-right font-medium py-2.5 pl-3 pr-1 w-10">#</th>
              <th className="text-left font-medium py-2.5 px-2">Hardware</th>
              <th className="text-left font-medium py-2.5 px-2 w-[170px]">
                Best PipelineScore
              </th>
              <th className="text-left font-medium py-2.5 px-2">Best model on this rig</th>
              <th className="text-right font-medium py-2.5 px-2 w-16">Runs</th>
              <th className="text-right font-medium py-2.5 px-2 w-16 hidden md:table-cell">
                Users
              </th>
              <th className="text-right font-medium py-2.5 px-2 w-24 hidden lg:table-cell">
                Avg latency
              </th>
              <th className="text-center font-medium py-2.5 pl-2 pr-3 w-24">Tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.tag}
                className="border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors"
              >
                <td className="py-2 pl-3 pr-1 text-right font-mono text-xs text-[var(--color-ink-3)] tabular-nums">
                  {i + 1}
                </td>
                <td className="py-2 px-2">
                  <Link
                    href={`/leaderboard/users?hardware=${encodeURIComponent(r.tag)}`}
                    prefetch={false}
                    className="font-mono text-[13px] font-semibold text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                  >
                    {r.tag}
                  </Link>
                </td>
                <td className="py-2 px-2">
                  <BenchBar value={r.bestScore} strong />
                </td>
                <td className="py-2 px-2">
                  <Link
                    href={`/models/${r.bestModel.slug}`}
                    prefetch={false}
                    className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                  >
                    {r.bestModel.displayName}
                  </Link>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                    {r.bestModel.provider}
                  </span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums">
                  {r.runs}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums hidden md:table-cell">
                  {r.users}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums hidden lg:table-cell">
                  {r.avgLatencyMs !== null ? `${r.avgLatencyMs.toLocaleString()}ms` : "—"}
                </td>
                <td className="py-2 pl-2 pr-3 text-center">
                  <TierBadge tier={r.bestTier} size="sm" />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-ink-3)]">
                  No hardware-tagged runs yet. Be the first —{" "}
                  <Link href="/run" className="underline hover:text-[var(--color-emerald)]">
                    run the CLI
                  </Link>{" "}
                  with <span className="font-mono">--hardware-tag</span>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[var(--color-ink-3)] leading-relaxed max-w-2xl">
        Click a hardware tag to see every run on that rig. A rig&apos;s rank
        reflects its best showing, so it rewards the best model the hardware
        can hold — exactly the question you&apos;re asking when you spec a
        machine.
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
