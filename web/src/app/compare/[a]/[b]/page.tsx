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
        {winner && (
          <p className="text-lg text-[var(--color-ink-2)] mt-4">
            <span className="text-[var(--color-ink)] font-medium">{winner.displayName}</span>{" "}
            leads on the composite by{" "}
            <span className="font-mono text-[var(--color-ink)]">
              {Math.abs(ma.pipelineScore - mb.pipelineScore).toFixed(1)}
            </span>{" "}
            points.
          </p>
        )}
      </div>

      {/* Two big score cards */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScoreCard model={ma} />
        <ScoreCard model={mb} />
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
              const aWins = va > vb;
              return (
                <div
                  key={cat}
                  className="grid grid-cols-[1fr_2fr_1fr] md:grid-cols-[1fr_3fr_1fr] items-center gap-4 md:gap-6 py-4 border-b border-[var(--color-line-2)] last:border-b-0"
                >
                  {/* A side bar */}
                  <div className="flex items-center justify-end gap-3">
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
                      className={`font-mono tabular-nums text-sm ${!aWins ? "text-[var(--color-ink)] font-semibold" : "text-[var(--color-ink-2)]"}`}
                    >
                      {vb.toFixed(1)}
                    </span>
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

function ScoreCard({ model }: { model: Model }) {
  return (
    <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10 flex flex-col gap-4">
      <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
        {model.provider}
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
