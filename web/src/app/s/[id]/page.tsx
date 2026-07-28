import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmission } from "@/lib/api";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { CategoryBars } from "@/components/CategoryBars";
import { CopyCommand } from "@/components/CopyCommand";

// Every CLI run prints this URL on its score card — the page must reflect the
// submission the moment it lands.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sub = await getSubmission(id);
  if (sub === null) return { title: "PipelineScore run" };
  if (!sub) return { title: "Run not found" };
  const rig = sub.hardwareTag ? ` on ${sub.hardwareTag}` : "";
  const title = `${sub.pipelineScore.toFixed(1)} ${sub.tier.toUpperCase()} — ${sub.model.displayName}${rig}`;
  const description = `A PipelineScore run: ${sub.model.displayName}${rig} scored ${sub.pipelineScore.toFixed(1)}/100 across 34 deterministic tasks. Benchmark your own hardware at pipelinescore.ai.`;
  // The root layout defines its own openGraph block, and a bare `title` here
  // does NOT override it — so these pages used to unfurl on Reddit/X/Slack as a
  // generic site card with the score nowhere in sight. Set them explicitly.
  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url: `/s/${id}`,
      siteName: "PipelineScore",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    // Individual runs are thin, near-duplicate pages: fine to unfurl and share,
    // not something to fill the index with.
    robots: { index: false, follow: true },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sub = await getSubmission(id);
  if (sub === null) {
    // Backend unreachable (likely a cold start) — don't 404 someone's share link.
    return (
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-24 text-center">
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          Benchmark run
        </div>
        <h1 className="display text-3xl font-bold text-[var(--color-ink)] mt-4">
          The leaderboard is waking up…
        </h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-3 leading-relaxed">
          The API is spinning up from a cold start. Refresh in a few seconds —
          this run isn&apos;t going anywhere.
        </p>
      </div>
    );
  }
  if (!sub) notFound();

  const date = sub.createdAt ? new Date(sub.createdAt).toISOString().slice(0, 10) : "";

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-16 md:py-24">
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Benchmark run
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-8 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="text-sm uppercase tracking-wider text-[var(--color-ink-3)]">
              {sub.model.provider}
            </div>
            <Link
              href={`/models/${sub.model.slug}`}
              prefetch={false}
              className="display block text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-1 hover:text-[var(--color-emerald)] transition-colors"
            >
              {sub.model.displayName}
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-mono">
              {sub.hardwareTag && (
                <Link
                  href={`/leaderboard/users?hardware=${encodeURIComponent(sub.hardwareTag)}`}
                  prefetch={false}
                  className="px-2.5 py-1 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
                >
                  {sub.hardwareTag}
                </Link>
              )}
              {sub.configTag && (
                <span className="px-2.5 py-1 rounded-full border border-[var(--color-line)] text-[var(--color-ink-2)]">
                  {sub.configTag}
                </span>
              )}
              {sub.userNickname && (
                <Link
                  href={`/users/${encodeURIComponent(sub.userNickname)}`}
                  prefetch={false}
                  className="px-2.5 py-1 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
                >
                  by {sub.userNickname}
                </Link>
              )}
              {sub.labVerified && (
                <span className="px-2.5 py-1 rounded-full bg-[color:var(--color-emerald)]/10 text-[var(--color-emerald)] uppercase tracking-wider font-semibold">
                  Lab verified
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-3">
            <ScoreNumber score={sub.pipelineScore} size="xl" />
            <TierBadge tier={sub.tier} size="lg" />
            {sub.ciLow !== null && sub.ciHigh !== null && (
              <div className="font-mono text-[11px] text-[var(--color-ink-3)] tabular-nums">
                95% CI {sub.ciLow.toFixed(1)}–{sub.ciHigh.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[var(--color-line-2)]">
          <CategoryBars scores={sub.categoryScores} />
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--color-line-2)] flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-[var(--color-ink-3)]">
          {date && <span>{date}</span>}
          {sub.testpackVersion && <span>testpack {sub.testpackVersion}</span>}
          <span>cli {sub.cliVersion}</span>
          <span>34 deterministic tasks · scored locally</span>
        </div>
      </div>

      {/* The conversion moment: they came from someone's share link. */}
      <div className="mt-10">
        <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">
          How does your rig stack up?
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 leading-relaxed">
          Same 34 tasks, scored on your machine — no API key, no account. One
          command:
        </p>
        <div className="mt-4">
          <CopyCommand command="npx @pipelinescore/cli" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5 text-sm font-semibold">
          <Link
            href="/run"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[var(--color-emerald)] text-white hover:bg-[var(--color-emerald-dark)] transition-colors"
          >
            Run it on your hardware
          </Link>
          <Link
            href="/leaderboard/users"
            className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
          >
            Full leaderboard →
          </Link>
          <a
            href="https://github.com/drewmattie-code/pipelinescore"
            className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
          >
            Star on GitHub ★
          </a>
        </div>
      </div>
    </div>
  );
}
