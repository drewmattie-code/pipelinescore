import Link from "next/link";
import { notFound } from "next/navigation";
import { getModel } from "@/lib/api";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { CATEGORY_LABELS, TIER_BY_ID, tierForScore } from "@/lib/tiers";
import type { Model } from "@/lib/types";

const CATEGORIES = ["code", "reason", "tool_use", "rag", "speed"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const [ma, mb] = await Promise.all([getModel(a), getModel(b)]);
  if (!ma || !mb) return { title: "Comparison" };
  return {
    title: `${ma.displayName} vs ${mb.displayName}`,
    description: `Head-to-head PipelineScore comparison: ${ma.displayName} (${ma.pipelineScore.toFixed(1)}) vs ${mb.displayName} (${mb.pipelineScore.toFixed(1)}). Category-by-category breakdown.`,
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a, b } = await params;
  const [ma, mb] = await Promise.all([getModel(a), getModel(b)]);
  if (!ma || !mb) notFound();

  const winner: Model | null =
    ma.pipelineScore === mb.pipelineScore
      ? null
      : ma.pipelineScore > mb.pipelineScore
      ? ma
      : mb;
  const loser = winner === null ? null : winner === ma ? mb : ma;
  const advantagePts =
    winner && loser ? winner.pipelineScore - loser.pipelineScore : 0;
  const advantagePct =
    winner && loser && loser.pipelineScore > 0
      ? (advantagePts / loser.pipelineScore) * 100
      : null;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
      <Link
        href="/leaderboard"
        className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
      >
        ← Back to leaderboard
      </Link>

      <div className="mt-8 max-w-3xl">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          Head-to-head
        </span>
        <h1 className="display text-4xl md:text-6xl font-semibold tracking-tight text-[var(--color-ink)] mt-3">
          {ma.displayName} <span className="text-[var(--color-ink-3)]">vs</span> {mb.displayName}
        </h1>
      </div>

      {/* Verdict banner */}
      {winner ? (
        <div className="mt-8 rounded-lg border border-[color:var(--color-emerald)]/40 bg-[color:var(--color-emerald)]/8 px-5 py-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-base md:text-lg font-bold text-[var(--color-ink)]">
            {winner.displayName} wins
          </span>
          <span className="font-mono tabular-nums text-sm md:text-base font-bold text-[var(--color-emerald)]">
            +{advantagePts.toFixed(1)} pts
            {advantagePct !== null && ` (+${advantagePct.toFixed(0)}%)`}
          </span>
          <span className="text-sm text-[var(--color-ink-2)]">
            on the balanced composite.
          </span>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface-2)] px-5 py-4 text-sm text-[var(--color-ink-2)]">
          Dead heat on the composite — check the category rows below.
        </div>
      )}

      {/* Two big score cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScoreCard model={ma} winner={winner === ma} />
        <ScoreCard model={mb} winner={winner === mb} />
      </div>

      {/* Category-by-category */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Category-by-category
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
          Higher bar wins each row.
        </p>
        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10">
          <div className="grid grid-cols-[1fr_2fr_1fr] md:grid-cols-[1fr_3fr_1fr] gap-4 md:gap-6 text-xs uppercase tracking-wider text-[var(--color-ink-3)] pb-4 border-b border-[var(--color-line-2)]">
            <div className="text-right truncate">{ma.displayName}</div>
            <div className="text-center">Category</div>
            <div className="text-left truncate">{mb.displayName}</div>
          </div>
          <div className="flex flex-col mt-2">
            {CATEGORIES.map((cat) => {
              const va = ma.categoryScores[cat];
              const vb = mb.categoryScores[cat];
              const max = Math.max(va, vb, 100);
              const ca = TIER_BY_ID[tierForScore(va)].color;
              const cb = TIER_BY_ID[tierForScore(vb)].color;
              const delta = va - vb;
              const aWins = delta > 0;
              const bWins = delta < 0;
              return (
                <div
                  key={cat}
                  className="grid grid-cols-[1fr_2fr_1fr] md:grid-cols-[1fr_3fr_1fr] items-center gap-4 md:gap-6 py-4 border-b border-[var(--color-line-2)] last:border-b-0"
                >
                  {/* A side bar */}
                  <div className="flex items-center justify-end gap-3">
                    <DeltaChip delta={aWins ? delta : bWins ? delta : null} />
                    <span
                      className={`font-mono tabular-nums text-sm ${aWins ? "text-[var(--color-ink)] font-semibold" : "text-[var(--color-ink-2)]"}`}
                    >
                      {va.toFixed(1)}
                    </span>
                    <div className="flex-1 h-2 bg-[var(--color-line-2)] rounded-full overflow-hidden max-w-[180px]">
                      <div
                        className="h-full rounded-full ml-auto"
                        style={{
                          width: `${(va / max) * 100}%`,
                          backgroundColor: ca,
                          marginLeft: "auto",
                          float: "right" as const,
                        }}
                      />
                    </div>
                  </div>
                  {/* Label */}
                  <div className="text-center text-sm uppercase tracking-wider text-[var(--color-ink-2)]">
                    {CATEGORY_LABELS[cat]}
                  </div>
                  {/* B side bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-[var(--color-line-2)] rounded-full overflow-hidden max-w-[180px]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(vb / max) * 100}%`,
                          backgroundColor: cb,
                        }}
                      />
                    </div>
                    <span
                      className={`font-mono tabular-nums text-sm ${bWins ? "text-[var(--color-ink)] font-semibold" : "text-[var(--color-ink-2)]"}`}
                    >
                      {vb.toFixed(1)}
                    </span>
                    <DeltaChip delta={bWins ? -delta : aWins ? -delta : null} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatPanel model={ma} />
        <StatPanel model={mb} />
      </section>
    </div>
  );
}

/** Signed point-difference chip: green when ahead, red when behind. */
function DeltaChip({ delta }: { delta: number | null }) {
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

function ScoreCard({ model, winner = false }: { model: Model; winner?: boolean }) {
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
          {model.provider}
        </div>
        {winner && (
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--color-emerald)]">
            Winner
          </span>
        )}
      </div>
      <Link
        href={`/models/${model.slug}`}
        className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
      >
        {model.displayName}
      </Link>
      <div className="flex items-end gap-4 mt-4">
        <ScoreNumber score={model.pipelineScore} size="lg" />
        <TierBadge tier={model.tier} size="md" />
      </div>
    </div>
  );
}

function StatPanel({ model }: { model: Model }) {
  return (
    <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6 md:p-8">
      <div className="text-sm font-semibold text-[var(--color-ink)]">
        {model.displayName}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Provider</dt>
        <dd className="text-[var(--color-ink)] text-right">{model.provider}</dd>
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Released</dt>
        <dd className="text-[var(--color-ink)] text-right">{model.releasedAt}</dd>
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Context</dt>
        <dd className="text-[var(--color-ink)] text-right font-mono">
          {(model.contextWindow / 1000).toLocaleString()}K
        </dd>
        <dt className="text-[var(--color-ink-3)] uppercase tracking-wider text-xs">Lab</dt>
        <dd className="text-[var(--color-ink)] text-right">
          {model.labVerified ? "Verified" : "Community"}
        </dd>
      </dl>
    </div>
  );
}
