import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserProfile, getUserDirectory } from "@/lib/api";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { CategoryBars } from "@/components/CategoryBars";
import { TIER_BY_ID, CATEGORY_LABELS } from "@/lib/tiers";

const CATEGORIES = ["code", "reason", "write", "tool_use", "rag", "speed"] as const;

export async function generateStaticParams() {
  const dir = await getUserDirectory();
  return dir.slice(0, 50).map((u) => ({ nickname: u.userNickname }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const profile = await getUserProfile(decodeURIComponent(nickname));
  if (!profile)
    return { title: `${decodeURIComponent(nickname)} · PipelineScore` };
  return {
    title: `${profile.nickname} · PipelineScore`,
    description: `${profile.nickname}'s PipelineScore profile: ${profile.submissionCount} runs, best ${profile.bestScore.toFixed(1)} on ${profile.bestModel.displayName}. Models tried, category strengths, history.`,
  };
}

export default async function UserDashboardPage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const decoded = decodeURIComponent(nickname);
  const profile = await getUserProfile(decoded);
  if (!profile) notFound();

  // Category strengths: average across all submissions to get user's signature pattern.
  const catTotals: Record<string, { sum: number; n: number }> = {};
  for (const sub of profile.submissions) {
    for (const c of CATEGORIES) {
      const v = sub.categoryScores[c];
      if (!catTotals[c]) catTotals[c] = { sum: 0, n: 0 };
      catTotals[c].sum += v;
      catTotals[c].n += 1;
    }
  }
  const avgCategoryScores = {
    code: catTotals.code ? catTotals.code.sum / catTotals.code.n : 0,
    reason: catTotals.reason ? catTotals.reason.sum / catTotals.reason.n : 0,
    write: catTotals.write ? catTotals.write.sum / catTotals.write.n : 0,
    tool_use: catTotals.tool_use ? catTotals.tool_use.sum / catTotals.tool_use.n : 0,
    rag: catTotals.rag ? catTotals.rag.sum / catTotals.rag.n : 0,
    speed: catTotals.speed ? catTotals.speed.sum / catTotals.speed.n : 0,
  };

  const sortedProviders = Object.entries(profile.providerCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
      <Link
        href="/leaderboard/users"
        className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
      >
        ← Back to user leaderboard
      </Link>

      {/* Header */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 items-start">
        <div>
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
            User profile
          </span>
          <h1 className="display text-5xl md:text-6xl font-semibold tracking-tight text-[var(--color-ink)] mt-3">
            {profile.nickname}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--color-ink-2)]">
            <span>
              <span className="font-mono text-[var(--color-ink)]">
                {profile.submissionCount}
              </span>{" "}
              run{profile.submissionCount === 1 ? "" : "s"}
            </span>
            <span>
              First seen{" "}
              <span className="text-[var(--color-ink)]">{profile.firstSeen.slice(0, 10)}</span>
            </span>
            <span>
              Avg{" "}
              <span className="font-mono text-[var(--color-ink)]">
                {profile.avgScore.toFixed(1)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-3">
          <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
            Best PipelineScore
          </div>
          <ScoreNumber score={profile.bestScore} size="xl" />
          <TierBadge tier={profile.bestTier} size="lg" />
          <div className="text-sm text-[var(--color-ink-2)]">
            on{" "}
            <Link
              href={`/models/${profile.bestModel.slug}`}
              className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors font-medium"
            >
              {profile.bestModel.displayName}
            </Link>
          </div>
        </div>
      </div>

      {/* Category signature */}
      <section className="mt-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12">
        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10">
          <h2 className="text-xl font-semibold text-[var(--color-ink)] tracking-tight">
            Category signature
          </h2>
          <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
            Average score per category across all {profile.submissionCount} run
            {profile.submissionCount === 1 ? "" : "s"}.
          </p>
          <CategoryBars scores={avgCategoryScores} />
        </div>

        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10">
          <h2 className="text-xl font-semibold text-[var(--color-ink)] tracking-tight">
            Provider mix
          </h2>
          <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-6">
            Where they spend their tokens.
          </p>
          <div className="flex flex-col gap-3">
            {sortedProviders.map(([provider, count]) => {
              const pct = (count / profile.submissionCount) * 100;
              return (
                <div key={provider}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm uppercase tracking-wider text-[var(--color-ink-2)]">
                      {provider}
                    </span>
                    <span className="font-mono text-xs text-[var(--color-ink-3)]">
                      {count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-line-2)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-emerald)] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Models tried — best score per */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Models tried
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
          Best score per model. Click a model to see its full page.
        </p>
        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-bg)]/60 border-b border-[var(--color-line-2)]">
              <tr className="text-left text-[var(--color-ink-3)] uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 hidden md:table-cell">Provider</th>
                <th className="px-4 py-3 text-right">Best Score</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 hidden lg:table-cell">Achieved</th>
              </tr>
            </thead>
            <tbody>
              {profile.modelsTried.map((m, i) => {
                const tier = TIER_BY_ID[m.tier];
                return (
                  <tr
                    key={m.submissionId}
                    className="border-b border-[var(--color-line-2)] last:border-b-0 hover:bg-[color:var(--color-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-ink-3)] font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/models/${m.model.slug}`}
                        className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors font-medium"
                      >
                        {m.model.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--color-ink-2)] uppercase text-xs tracking-wider">
                      {m.model.provider}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[var(--color-ink)]">
                      {m.pipelineScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: tier.color, backgroundColor: `${tier.color}20` }}
                      >
                        {tier.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-[var(--color-ink-3)] font-mono text-xs">
                      {m.submittedAt.slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full submission history */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          All submissions
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
          Every run, ordered by score.
        </p>
        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-bg)]/60 border-b border-[var(--color-line-2)]">
                <tr className="text-left text-[var(--color-ink-3)] uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Tier</th>
                  {CATEGORIES.map((c) => (
                    <th key={c} className="px-3 py-3 text-right hidden md:table-cell">
                      {CATEGORY_LABELS[c]}
                    </th>
                  ))}
                  <th className="px-4 py-3 hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {profile.submissions.map((s, i) => {
                  const tier = TIER_BY_ID[s.tier];
                  return (
                    <tr
                      key={s.submissionId}
                      className="border-b border-[var(--color-line-2)] last:border-b-0 hover:bg-[color:var(--color-bg)]/40 transition-colors"
                    >
                      <td className="px-4 py-3 text-[var(--color-ink-3)] font-mono text-xs">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/models/${s.model.slug}`}
                          className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                        >
                          {s.model.displayName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[var(--color-ink)]">
                        {s.pipelineScore.toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: tier.color, backgroundColor: `${tier.color}20` }}
                        >
                          {tier.name}
                        </span>
                      </td>
                      {CATEGORIES.map((c) => (
                        <td
                          key={c}
                          className="px-3 py-3 text-right hidden md:table-cell text-[var(--color-ink-2)] font-mono text-xs tabular-nums"
                        >
                          {s.categoryScores[c].toFixed(1)}
                        </td>
                      ))}
                      <td className="px-4 py-3 hidden lg:table-cell text-[var(--color-ink-3)] font-mono text-xs">
                        {s.submittedAt.slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
