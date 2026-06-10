import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserLeaderboard } from "@/lib/api";
import type { UserLeaderboardEntry } from "@/lib/types";
import { BenchBar } from "@/components/BenchBar";
import { DeltaChip } from "@/components/DeltaChip";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { priceFor } from "@/lib/rigPrices";

export const dynamic = "force-dynamic";

interface RigRollup {
  tag: string;
  best: UserLeaderboardEntry;
  runs: number;
  users: number;
  avgLatencyMs: number | null;
  price?: number;
  /** Best entry per model slug on this rig. */
  models: Map<string, UserLeaderboardEntry>;
}

async function loadRig(tag: string): Promise<RigRollup | null> {
  const page = await getUserLeaderboard({
    hardware: tag,
    sort: "score",
    dir: "desc",
    limit: 500,
  });
  if (page.entries.length === 0) return null;
  const users = new Set<string>();
  const latencies: number[] = [];
  const models = new Map<string, UserLeaderboardEntry>();
  for (const e of page.entries) {
    users.add(e.userNickname);
    if (e.efficiency.avgLatencyMs !== null) latencies.push(e.efficiency.avgLatencyMs);
    const cur = models.get(e.model.slug);
    if (!cur || e.pipelineScore > cur.pipelineScore) models.set(e.model.slug, e);
  }
  return {
    tag,
    best: page.entries[0],
    runs: page.entries.length,
    users: users.size,
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
        : null,
    price: priceFor(tag),
    models,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const ta = decodeURIComponent(a);
  const tb = decodeURIComponent(b);
  return {
    title: `${ta} vs ${tb} — rig head-to-head`,
    description: `Which rig runs LLMs better: ${ta} or ${tb}? Best PipelineScore, shared models side by side, latency and value compared on the same 34-task deterministic benchmark.`,
  };
}

export default async function HardwareComparePage({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const ta = decodeURIComponent(a);
  const tb = decodeURIComponent(b);
  const [ra, rb] = await Promise.all([loadRig(ta), loadRig(tb)]);
  if (!ra || !rb) notFound();

  const winner =
    ra.best.pipelineScore === rb.best.pipelineScore
      ? null
      : ra.best.pipelineScore > rb.best.pipelineScore
      ? ra
      : rb;
  const loser = winner === null ? null : winner === ra ? rb : ra;
  const advantagePts = winner && loser ? winner.best.pipelineScore - loser.best.pipelineScore : 0;
  const advantagePct =
    winner && loser && loser.best.pipelineScore > 0
      ? (advantagePts / loser.best.pipelineScore) * 100
      : null;

  // Models both rigs have run — the apples-to-apples section.
  const shared = Array.from(ra.models.keys())
    .filter((slug) => rb.models.has(slug))
    .map((slug) => ({
      a: ra.models.get(slug)!,
      b: rb.models.get(slug)!,
    }))
    .sort(
      (x, y) =>
        Math.max(y.a.pipelineScore, y.b.pipelineScore) -
        Math.max(x.a.pipelineScore, x.b.pipelineScore)
    );
  const onlyA = ra.models.size - shared.length;
  const onlyB = rb.models.size - shared.length;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
      <Link
        href="/leaderboard/hardware"
        className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
      >
        ← Back to hardware board
      </Link>

      <div className="mt-8 max-w-4xl">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          Rig head-to-head
        </span>
        <h1 className="display text-3xl md:text-5xl font-semibold tracking-tight text-[var(--color-ink)] mt-3 font-mono">
          {ra.tag} <span className="text-[var(--color-ink-3)]">vs</span> {rb.tag}
        </h1>
      </div>

      {/* Verdict banner */}
      {winner ? (
        <div className="mt-8 rounded-lg border border-[color:var(--color-emerald)]/40 bg-[color:var(--color-emerald)]/8 px-5 py-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-base md:text-lg font-bold font-mono text-[var(--color-ink)]">
            {winner.tag} wins
          </span>
          <span className="font-mono tabular-nums text-sm md:text-base font-bold text-[var(--color-emerald)]">
            +{advantagePts.toFixed(1)} pts
            {advantagePct !== null && ` (+${advantagePct.toFixed(0)}%)`}
          </span>
          <span className="text-sm text-[var(--color-ink-2)]">
            on best run posted.
          </span>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface-2)] px-5 py-4 text-sm text-[var(--color-ink-2)]">
          Dead heat on best run — check the shared models below.
        </div>
      )}

      {/* Rig cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <RigCard rollup={ra} winner={winner === ra} />
        <RigCard rollup={rb} winner={winner === rb} />
      </div>

      {/* Shared models — apples to apples */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Same model, both rigs
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-6">
          Best score per model on each rig — identical testpack, identical
          weights, only the hardware differs.
        </p>
        {shared.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)]">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">
                  <th className="text-left font-medium py-2.5 pl-3 px-2">Model</th>
                  <th className="text-left font-medium py-2.5 px-2 w-[230px] font-mono normal-case">
                    {ra.tag}
                  </th>
                  <th className="text-left font-medium py-2.5 px-2 w-[230px] font-mono normal-case">
                    {rb.tag}
                  </th>
                  <th className="text-left font-medium py-2.5 px-2 pr-3 hidden md:table-cell">
                    Faster rig
                  </th>
                </tr>
              </thead>
              <tbody>
                {shared.map(({ a: ea, b: eb }) => {
                  const delta = ea.pipelineScore - eb.pipelineScore;
                  const la = ea.efficiency.avgLatencyMs;
                  const lb = eb.efficiency.avgLatencyMs;
                  const fasterTag =
                    la !== null && lb !== null && la !== lb
                      ? la < lb
                        ? ra.tag
                        : rb.tag
                      : null;
                  return (
                    <tr
                      key={ea.model.slug}
                      className="border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors"
                    >
                      <td className="py-2 pl-3 px-2">
                        <Link
                          href={`/models/${ea.model.slug}`}
                          prefetch={false}
                          className="font-medium text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                        >
                          {ea.model.displayName}
                        </Link>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <BenchBar value={ea.pipelineScore} strong={delta > 0} />
                          <DeltaChip delta={delta !== 0 ? delta : null} />
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <BenchBar value={eb.pipelineScore} strong={delta < 0} />
                          <DeltaChip delta={delta !== 0 ? -delta : null} />
                        </div>
                      </td>
                      <td className="py-2 px-2 pr-3 hidden md:table-cell">
                        {fasterTag ? (
                          <span className="font-mono text-xs text-[var(--color-ink-2)]">
                            {fasterTag}{" "}
                            <span className="text-[var(--color-ink-3)]">
                              ({Math.min(la!, lb!).toLocaleString()}ms)
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] px-5 py-10 text-center text-sm text-[var(--color-ink-3)]">
            No overlapping models yet — these rigs haven&apos;t run the same
            model. Best-run comparison above still holds.
          </div>
        )}
        {(onlyA > 0 || onlyB > 0) && (
          <p className="mt-3 text-xs text-[var(--color-ink-3)]">
            {onlyA > 0 && (
              <>
                {onlyA} model{onlyA === 1 ? "" : "s"} only tested on{" "}
                <span className="font-mono">{ra.tag}</span>
              </>
            )}
            {onlyA > 0 && onlyB > 0 && " · "}
            {onlyB > 0 && (
              <>
                {onlyB} model{onlyB === 1 ? "" : "s"} only tested on{" "}
                <span className="font-mono">{rb.tag}</span>
              </>
            )}
            . Run the missing ones to settle it.
          </p>
        )}
      </section>

      <div className="mt-12 flex items-center gap-6 text-sm">
        <Link
          href={`/leaderboard/users?hardware=${encodeURIComponent(ra.tag)}`}
          prefetch={false}
          className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)] underline"
        >
          All runs on {ra.tag}
        </Link>
        <Link
          href={`/leaderboard/users?hardware=${encodeURIComponent(rb.tag)}`}
          prefetch={false}
          className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)] underline"
        >
          All runs on {rb.tag}
        </Link>
      </div>
    </div>
  );
}

function RigCard({ rollup, winner }: { rollup: RigRollup; winner: boolean }) {
  return (
    <div
      className={`rounded-3xl border bg-[var(--color-surface)] p-8 md:p-10 flex flex-col gap-4 ${
        winner
          ? "border-[var(--color-emerald)] shadow-[0_0_0_1px_var(--color-emerald)]"
          : "border-[var(--color-line-2)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
          Hardware
        </div>
        {winner && (
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--color-emerald)]">
            Winner
          </span>
        )}
      </div>
      <div className="font-mono text-xl md:text-2xl font-semibold tracking-tight text-[var(--color-ink)] break-all">
        {rollup.tag}
      </div>
      <div className="flex items-end gap-4 mt-2">
        <ScoreNumber score={rollup.best.pipelineScore} size="lg" />
        <TierBadge tier={rollup.best.tier} size="md" />
      </div>
      <div className="text-sm text-[var(--color-ink-2)]">
        best run:{" "}
        <Link
          href={`/models/${rollup.best.model.slug}`}
          prefetch={false}
          className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors font-medium"
        >
          {rollup.best.model.displayName}
        </Link>{" "}
        by{" "}
        <Link
          href={`/users/${encodeURIComponent(rollup.best.userNickname)}`}
          prefetch={false}
          className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
        >
          {rollup.best.userNickname}
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm border-t border-[var(--color-line-2)] pt-4">
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Runs</dt>
        <dd className="text-[var(--color-ink)] text-right font-mono tabular-nums">{rollup.runs}</dd>
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Users</dt>
        <dd className="text-[var(--color-ink)] text-right font-mono tabular-nums">{rollup.users}</dd>
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Avg latency</dt>
        <dd className="text-[var(--color-ink)] text-right font-mono tabular-nums">
          {rollup.avgLatencyMs !== null ? `${rollup.avgLatencyMs.toLocaleString()}ms` : "—"}
        </dd>
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Est. price</dt>
        <dd className="text-[var(--color-ink)] text-right font-mono tabular-nums">
          {rollup.price !== undefined ? `$${rollup.price.toLocaleString()}` : "—"}
        </dd>
      </dl>
    </div>
  );
}
