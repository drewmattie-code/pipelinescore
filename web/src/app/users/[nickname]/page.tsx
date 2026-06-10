import Link from "next/link";
import { notFound } from "next/navigation";
import { getHardwareBoard, getUserLeaderboard, getUserProfile } from "@/lib/api";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { CategoryBars } from "@/components/CategoryBars";
import { BetaBadge } from "@/components/BetaBadge";
import { TIER_BY_ID, CATEGORY_LABELS } from "@/lib/tiers";
import { beatsPct } from "@/lib/rank";

const CATEGORIES = ["code", "reason", "tool_use", "rag", "speed"] as const;

// Render on-demand at request time. User dashboards change constantly as
// submissions land, and new nicknames appear without notice — force-dynamic
// avoids stale data + 404s on freshly-submitted users.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const profile = await getUserProfile(decodeURIComponent(nickname));
  if (!profile)
    return { title: decodeURIComponent(nickname) };
  return {
    title: profile.nickname,
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
  const [profile, population] = await Promise.all([
    getUserProfile(decoded),
    getUserLeaderboard({ sort: "score", dir: "desc", limit: 500 }),
  ]);
  if (!profile) notFound();

  // Standing: where this user's best run sits in the whole population, and
  // where their best rig sits on the hardware board.
  const rigBoard = await getHardwareBoard(population);
  const beats = beatsPct(
    profile.bestScore,
    population.entries.map((e) => e.pipelineScore)
  );
  const bestTagged = [...profile.submissions]
    .filter((s) => s.hardwareTag)
    .sort((a, b) => b.pipelineScore - a.pipelineScore)[0];
  const rigRank = bestTagged
    ? rigBoard.findIndex((r) => r.tag === bestTagged.hardwareTag) + 1
    : 0;

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
    tool_use: catTotals.tool_use ? catTotals.tool_use.sum / catTotals.tool_use.n : 0,
    rag: catTotals.rag ? catTotals.rag.sum / catTotals.rag.n : 0,
    speed: catTotals.speed ? catTotals.speed.sum / catTotals.speed.n : 0,
  };

  const sortedProviders = Object.entries(profile.providerCounts).sort((a, b) => b[1] - a[1]);
  const sortedHardware = Object.entries(profile.hardwareCounts).sort((a, b) => b[1] - a[1]);

  // Format big numbers as e.g. "53.3K"
  const fmtBig = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

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
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <h1 className="display text-5xl md:text-6xl font-bold tracking-tight text-[var(--color-ink)]">
              {profile.nickname}
            </h1>
            {profile.betaTesterRank && (
              <BetaBadge rank={profile.betaTesterRank} size="lg" />
            )}
          </div>
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

      {/* Standing band — where this user sits in the population */}
      <section className="mt-10 rounded-lg border border-[color:var(--color-emerald)]/40 bg-[color:var(--color-emerald)]/8 px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
        <span className="text-[var(--color-ink-2)]">
          Best run beats{" "}
          <span className="font-mono tabular-nums font-bold text-[var(--color-emerald)]">
            {beats}%
          </span>{" "}
          of all {population.total.toLocaleString()} submissions
        </span>
        {rigRank > 0 && bestTagged && (
          <span className="text-[var(--color-ink-2)]">
            Best rig{" "}
            <Link
              href={`/leaderboard/users?hardware=${encodeURIComponent(bestTagged.hardwareTag!)}`}
              prefetch={false}
              className="font-mono text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
            >
              {bestTagged.hardwareTag}
            </Link>{" "}
            ranks{" "}
            <span className="font-mono tabular-nums font-bold text-[var(--color-emerald)]">
              #{rigRank}
            </span>{" "}
            of {rigBoard.length} rigs
          </span>
        )}
      </section>

      {/* Efficiency strip — total tokens, avg latency, tasks run */}
      <section className="mt-12 rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-ink)] text-white p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
        <Efficiency
          label="Total tokens"
          value={fmtBig(profile.efficiency.totalTokens)}
          hint="Across every task this user has run"
        />
        <Efficiency
          label="Avg latency"
          value={profile.efficiency.avgLatencyMs !== null ? `${profile.efficiency.avgLatencyMs}ms` : "—"}
          hint="Per task, across all submissions"
        />
        <Efficiency
          label="Tasks run"
          value={fmtBig(profile.efficiency.totalTasksRun)}
          hint={`${profile.submissionCount} submission${profile.submissionCount === 1 ? "" : "s"} x ~34 tasks`}
        />
        <Efficiency
          label="Rigs used"
          value={String(Object.keys(profile.hardwareCounts).length)}
          hint="Distinct hardware tags"
        />
      </section>

      {/* Category signature */}
      <section className="mt-12 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12">
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

        <div className="rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10 flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">
              Hardware mix
            </h2>
            <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-4">
              Rigs this user benchmarked on.
            </p>
            <div className="flex flex-col gap-2">
              {sortedHardware.map(([hardware, count]) => {
                const pct = (count / profile.submissionCount) * 100;
                const isUnspec = hardware === "unspecified";
                return (
                  <div key={hardware}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span
                        className={`text-xs font-mono ${isUnspec ? "text-[var(--color-ink-3)] italic" : "text-[var(--color-ink)]"}`}
                      >
                        {isUnspec ? "no hardware tag" : hardware}
                      </span>
                      <span className="font-mono text-xs text-[var(--color-ink-3)]">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-line-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-ink)] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">
              Provider mix
            </h2>
            <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-4">
              Where they spend their tokens.
            </p>
            <div className="flex flex-col gap-2">
              {sortedProviders.map(([provider, count]) => {
                const pct = (count / profile.submissionCount) * 100;
                return (
                  <div key={provider}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm uppercase tracking-wider text-[var(--color-ink)]">
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
                  <th className="px-4 py-3 hidden lg:table-cell">Hardware</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Tier</th>
                  {CATEGORIES.map((c) => (
                    <th key={c} className="px-3 py-3 text-right hidden xl:table-cell">
                      {CATEGORY_LABELS[c]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right hidden md:table-cell">Tokens</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Avg ms</th>
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
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {s.hardwareTag ? (
                          <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[color:var(--color-line-2)] text-[var(--color-ink)]">
                            {s.hardwareTag}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">—</span>
                        )}
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
                          className="px-3 py-3 text-right hidden xl:table-cell text-[var(--color-ink-2)] font-mono text-xs tabular-nums"
                        >
                          {s.categoryScores[c].toFixed(1)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--color-ink-2)] font-mono text-xs tabular-nums">
                        {fmtBig(s.efficiency.totalTokens)}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--color-ink-2)] font-mono text-xs tabular-nums">
                        {s.efficiency.avgLatencyMs ?? "—"}
                      </td>
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

function Efficiency({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] md:text-xs uppercase tracking-[0.18em] text-[var(--color-emerald-light)] font-semibold">
        {label}
      </span>
      <span className="font-mono text-2xl md:text-3xl font-bold tabular-nums text-white">
        {value}
      </span>
      <span className="text-[10px] text-[color:var(--color-line)] mt-0.5 leading-snug">
        {hint}
      </span>
    </div>
  );
}
