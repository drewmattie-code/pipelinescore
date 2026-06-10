import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeaderboardModels, getModel, getUserLeaderboard, SAMPLE_TASKS } from "@/lib/api";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { CategoryBars } from "@/components/CategoryBars";
import { CATEGORY_LABELS, TIER_BY_ID, tierForScore } from "@/lib/tiers";
import { ordinal, percentileOfRank } from "@/lib/rank";
import { verdictFor } from "@/lib/verdict";

// Model stats refresh constantly as community submissions land — force-dynamic
// so the median + best-score + per-category bars stay current. New models
// (added via CLI submission) also become reachable without a rebuild.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = await getModel(slug);
  if (!model) return { title: "Model not found" };
  return {
    title: model.displayName,
    description: `PipelineScore: ${model.pipelineScore.toFixed(1)} (${model.tier.toUpperCase()}). Full category breakdown, sample tasks, and head-to-head comparisons for ${model.displayName}.`,
  };
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [model, allModels, allRuns] = await Promise.all([
    getModel(slug),
    getLeaderboardModels(),
    getUserLeaderboard({ sort: "score", dir: "desc", limit: 500 }),
  ]);
  if (!model) notFound();

  const otherModels = allModels.filter((m) => m.slug !== model.slug).slice(0, 5);

  // Standing on the board (board is already sorted best-first).
  const rank = allModels.findIndex((m) => m.slug === model.slug) + 1;

  // Every submission of THIS model, across all rigs (entries arrive score-desc).
  const runs = allRuns.entries.filter((e) => e.model.slug === model.slug);
  const bestRun = runs[0];
  const worstRun = runs[runs.length - 1];
  const spread = runs.length >= 2 ? bestRun.pipelineScore - worstRun.pipelineScore : 0;
  const medianScore =
    runs.length > 0 ? runs[Math.floor(runs.length / 2)].pipelineScore : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
      <Link
        href="/leaderboard"
        className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
      >
        ← Back to leaderboard
      </Link>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 items-start">
        <div>
          <div className="text-sm uppercase tracking-wider text-[var(--color-ink-3)]">
            {model.provider}
          </div>
          <h1 className="display text-5xl md:text-6xl font-semibold tracking-tight text-[var(--color-ink)] mt-2">
            {model.displayName}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--color-ink-2)]">
            <span>
              Released <span className="text-[var(--color-ink)]">{model.releasedAt}</span>
            </span>
            <span>
              Context{" "}
              <span className="font-mono text-[var(--color-ink)]">
                {(model.contextWindow / 1000).toLocaleString()}K
              </span>
            </span>
            <span className="font-mono text-xs text-[var(--color-ink-3)]">{model.slug}</span>
            {model.labVerified && (
              <span className="text-[var(--color-emerald)] uppercase text-[10px] tracking-wider font-semibold">
                Lab Verified
              </span>
            )}
          </div>
          {model.notes && (
            <p className="mt-6 text-base text-[var(--color-ink-2)] leading-relaxed max-w-2xl">
              {model.notes}
            </p>
          )}
        </div>

        <div className="flex flex-col items-start lg:items-end gap-3">
          <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
            PipelineScore
          </div>
          <ScoreNumber score={model.pipelineScore} size="xl" />
          <TierBadge tier={model.tier} size="lg" />
        </div>
      </div>

      {/* Standing + verdict */}
      <div className="mt-10 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {rank > 0 && (
          <span className="font-mono tabular-nums whitespace-nowrap">
            <span className="font-bold text-[var(--color-emerald)]">
              Ranked #{rank}
            </span>
            <span className="text-[var(--color-ink-2)]"> of {allModels.length} models</span>
            <span className="text-[var(--color-ink-3)]">
              {" "}
              · {ordinal(percentileOfRank(rank, allModels.length))} percentile
            </span>
          </span>
        )}
        <span className="text-[var(--color-ink-2)]">
          {verdictFor(model.categoryScores)}
        </span>
      </div>

      {/* Category breakdown */}
      <section className="mt-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12">
        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10">
          <h2 className="text-xl font-semibold text-[var(--color-ink)] tracking-tight">
            Category breakdown
          </h2>
          <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
            Score per category, normalized 0–100 against the v1 anchor.
          </p>
          <CategoryBars scores={model.categoryScores} />
        </div>

        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10">
          <h2 className="text-xl font-semibold text-[var(--color-ink)] tracking-tight">
            Strengths
          </h2>
          <div className="mt-6 flex flex-col gap-4">
            {(Object.entries(model.categoryScores) as [keyof typeof CATEGORY_LABELS, number][])
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([cat, val]) => (
                <div key={cat} className="flex items-baseline justify-between border-b border-[var(--color-line-2)] pb-3 last:border-b-0 last:pb-0">
                  <span className="text-sm text-[var(--color-ink-2)] uppercase tracking-wider">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <ScoreNumber score={val} size="md" />
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Same model, different rigs — the distribution strip */}
      {runs.length >= 2 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Same model, different rigs
          </h2>
          <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-6">
            Every submission of {model.displayName} on the 0–100 scale. The
            spread is the point: where it runs changes what you get.
          </p>
          <div className="rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6 md:p-8">
            <div className="relative h-12">
              {/* Axis gridlines */}
              {[0, 25, 50, 75, 100].map((g) => (
                <div
                  key={g}
                  className="absolute top-0 bottom-0 w-px bg-[var(--color-line-2)]"
                  style={{ left: `${g}%` }}
                />
              ))}
              {/* Median marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-ink-3)]"
                style={{ left: `${Math.min(99, Math.max(1, medianScore))}%` }}
                title={`Median ${medianScore.toFixed(1)}`}
              />
              {/* One dot per run */}
              {runs.map((r) => {
                const isBest = r.submissionId === bestRun.submissionId;
                const color = TIER_BY_ID[tierForScore(r.pipelineScore)].color;
                return (
                  <span
                    key={r.submissionId}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ${
                      isBest
                        ? "w-4 h-4 border-2 border-[var(--color-ink)] z-10"
                        : "w-2.5 h-2.5 opacity-75"
                    }`}
                    style={{
                      left: `${Math.min(99, Math.max(1, r.pipelineScore))}%`,
                      backgroundColor: color,
                    }}
                    title={`${r.pipelineScore.toFixed(1)} on ${r.hardwareTag ?? "untagged"} by ${r.userNickname}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between font-mono text-[10px] text-[var(--color-ink-3)] tabular-nums mt-1">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
            <p className="mt-5 text-sm text-[var(--color-ink-2)] leading-relaxed">
              Best{" "}
              <span className="font-mono font-bold text-[var(--color-ink)]">
                {bestRun.pipelineScore.toFixed(1)}
              </span>{" "}
              on <span className="font-mono">{bestRun.hardwareTag ?? "untagged"}</span>
              {" · "}lowest{" "}
              <span className="font-mono text-[var(--color-ink)]">
                {worstRun.pipelineScore.toFixed(1)}
              </span>{" "}
              on <span className="font-mono">{worstRun.hardwareTag ?? "untagged"}</span>
              {" · "}spread{" "}
              <span className="font-mono text-[var(--color-ink)]">{spread.toFixed(1)}</span>{" "}
              pts across {runs.length} run{runs.length === 1 ? "" : "s"}. Hover
              a dot for its rig.
            </p>
          </div>
        </section>
      )}

      {/* Sample tasks */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Sample tasks
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
          A taste of what the test pack measures. Full prompts are private and rotated daily.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SAMPLE_TASKS.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6"
            >
              <div className="flex items-center gap-3 mb-3 text-xs">
                <span className="uppercase tracking-wider text-[var(--color-emerald)] font-semibold">
                  {CATEGORY_LABELS[t.category]}
                </span>
                <span className="text-[var(--color-ink-3)]">
                  Difficulty {t.difficulty}
                </span>
                <span className="font-mono text-[var(--color-ink-3)]">{t.id}</span>
              </div>
              <h3 className="font-medium text-[var(--color-ink)]">{t.title}</h3>
              <p className="text-sm text-[var(--color-ink-2)] mt-2 leading-relaxed">
                {t.prompt}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Compare-with */}
      <section className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Compare with
        </h2>
        <div className="flex flex-wrap gap-3 mt-6">
          {otherModels.map((other) => (
            <Link
              key={other.slug}
              href={`/compare/${model.slug}/${other.slug}`}
              className="px-4 py-2 rounded-full border border-[var(--color-line)] text-sm text-[var(--color-ink)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
            >
              {model.displayName} vs {other.displayName}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
