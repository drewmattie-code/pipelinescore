import Image from "next/image";
import Link from "next/link";
import { getLeaderboardModels, getStats } from "@/lib/api";
import { ScoreNumber } from "@/components/ScoreNumber";
import { TierBadge } from "@/components/TierBadge";
import { CategoryBarsInline } from "@/components/CategoryBars";

// Stats strip + top-of-leaderboard reflect live submission state. force-dynamic
// keeps both fresh on every request — no stale cached homepage.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [models, stats] = await Promise.all([getLeaderboardModels(), getStats()]);
  const top25 = models.slice(0, 25);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative w-full overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[color:var(--color-bg)]/40 via-[color:var(--color-bg)]/10 to-[color:var(--color-bg)]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 md:px-10 pt-28 md:pt-40 pb-32 md:pb-48">
          <div className="max-w-2xl">
            {/* Frosted card so the subhead stays readable over the pipe image. */}
            <div className="inline-flex flex-col gap-7 rounded-3xl backdrop-blur-md bg-[color:var(--color-bg)]/85 border border-[var(--color-line-2)] p-7 md:p-10 shadow-sm">
              <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
                LLM Benchmark · v1
              </span>
              <h1 className="display text-5xl md:text-7xl font-extrabold text-[var(--color-ink)] leading-[1.02]">
                How does your LLM actually rank?
              </h1>
              <p className="text-lg md:text-xl text-[var(--color-ink)] leading-relaxed max-w-xl font-medium">
                PipelineScore is the user-run benchmark. Bring your own API key,
                run a standardized 25-task suite, get a deterministic score, a
                tier badge, and a spot on the public leaderboard alongside
                everyone else who&apos;s benchmarked.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <Link
                  href="/run"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-ink)] text-white text-sm font-semibold hover:bg-[var(--color-emerald)] transition-colors"
                >
                  Get started
                </Link>
                <Link
                  href="/leaderboard/users"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] text-sm font-semibold hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
                >
                  See where you&apos;d rank →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live stat strip */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full -mt-6 md:-mt-10 relative z-10">
        <div className="rounded-3xl bg-[var(--color-ink)] text-white p-6 md:p-8 grid grid-cols-3 gap-4 md:gap-8 shadow-md">
          <Stat label="Submissions" value={stats.submission_count.toLocaleString()} />
          <Stat label="Users on the board" value={stats.user_count.toLocaleString()} />
          <Stat label="Models benchmarked" value={stats.model_count.toLocaleString()} />
        </div>
      </section>

      {/* Top of the leaderboard */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-16">
        <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-line-2)] shadow-sm p-6 md:p-10">
          <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-[var(--color-ink)] tracking-tight">
                Top of the leaderboard
              </h2>
              <p className="text-sm text-[var(--color-ink-2)] mt-1">
                Best run per model across all submissions.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/leaderboard/users"
                className="text-sm text-[var(--color-ink)] hover:text-[var(--color-emerald)] font-semibold"
              >
                Users Leaderboard →
              </Link>
              <Link
                href="/leaderboard"
                className="text-sm text-[var(--color-emerald)] hover:text-[var(--color-emerald-dark)] font-semibold"
              >
                Full models board →
              </Link>
            </div>
          </div>

          <div className="flex flex-col">
            {top25.map((m, i) => (
              <Link
                key={m.slug}
                href={`/models/${m.slug}`}
                className="group grid grid-cols-[2rem_1fr_auto_auto] md:grid-cols-[2.5rem_1.5fr_1fr_auto_auto_auto] items-center gap-4 md:gap-6 py-4 border-b border-[var(--color-line-2)] last:border-b-0 hover:bg-[var(--color-surface-2)] transition-colors rounded-xl px-3 -mx-3"
              >
                <span className="font-mono text-sm text-[var(--color-ink-3)] tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-emerald)] transition-colors truncate">
                    {m.displayName}
                  </div>
                  <div className="text-xs text-[var(--color-ink-2)] mt-0.5 uppercase tracking-wider">
                    {m.provider}
                  </div>
                </div>
                <div className="hidden md:block">
                  <CategoryBarsInline scores={m.categoryScores} />
                </div>
                <ScoreNumber score={m.pipelineScore} size="md" />
                <TierBadge tier={m.tier} size="sm" />
                <span className="hidden md:inline text-xs text-[var(--color-ink-3)] group-hover:text-[var(--color-ink)] transition-colors">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
          <Step
            n={1}
            title="Install the CLI"
            body="One npx command. No accounts, no setup. Bring your own provider key."
          />
          <Step
            n={2}
            title="Run the test pack"
            body="25 tasks across code, reasoning, writing, tool use, RAG, and speed. Signed and rotated daily."
          />
          <Step
            n={3}
            title="Get your score and tier"
            body="A deterministic 0–100 PipelineScore, a tier badge, and a shareable result card."
          />
        </div>
      </section>

      {/* Categories preview */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-32">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--color-ink)]">
            Six categories. One number.
          </h2>
          <p className="text-base text-[var(--color-ink-2)] mt-3 leading-relaxed">
            We weight each category to mirror real-world LLM usage — code first,
            reasoning close behind, the rest tuned for everyday operator workloads.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mt-10">
          <CategoryCard label="Code" weight="25%" />
          <CategoryCard label="Reason" weight="20%" />
          <CategoryCard label="Write" weight="15%" />
          <CategoryCard label="Tool Use" weight="15%" />
          <CategoryCard label="RAG" weight="12%" />
          <CategoryCard label="Speed" weight="13%" />
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono text-xs text-[var(--color-emerald)] tracking-wider font-semibold">
        STEP 0{n}
      </div>
      <h3 className="text-xl font-bold text-[var(--color-ink)]">{title}</h3>
      <p className="text-[var(--color-ink)] leading-relaxed">{body}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] md:text-xs uppercase tracking-[0.18em] text-[var(--color-emerald-light)] font-semibold">
        {label}
      </span>
      <span className="font-mono text-2xl md:text-4xl font-bold tabular-nums text-white">
        {value}
      </span>
    </div>
  );
}

function CategoryCard({ label, weight }: { label: string; weight: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line-2)] p-5 bg-[var(--color-surface)]">
      <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold text-[var(--color-ink)] mt-2 tabular-nums">
        {weight}
      </div>
    </div>
  );
}
