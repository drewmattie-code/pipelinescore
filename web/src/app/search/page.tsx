import Link from "next/link";
import { getHardwareBoard, getLeaderboardModels, getUserDirectory } from "@/lib/api";
import { BenchBar } from "@/components/BenchBar";
import { TierBadge } from "@/components/TierBadge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search",
  description: "Find any model, rig, or user on the PipelineScore board.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const needle = q.toLowerCase();

  const [models, rigs, users] = q
    ? await Promise.all([getLeaderboardModels(), getHardwareBoard(), getUserDirectory()])
    : [[], [], []];

  const modelHits = models
    .filter(
      (m) =>
        m.displayName.toLowerCase().includes(needle) ||
        m.slug.toLowerCase().includes(needle) ||
        m.provider.toLowerCase().includes(needle) ||
        m.family.toLowerCase().includes(needle)
    )
    .slice(0, 20);
  const rigHits = rigs.filter((r) => r.tag.toLowerCase().includes(needle)).slice(0, 20);
  const userHits = users
    .filter((u) => u.userNickname.toLowerCase().includes(needle))
    .slice(0, 20);
  const totalHits = modelHits.length + rigHits.length + userHits.length;

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Search
      </span>
      <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
        {q ? `Results for "${q}"` : "Find anything on the board."}
      </h1>

      <form action="/search" className="mt-8 max-w-md">
        <div className="relative">
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
            aria-hidden
          >
            ⌕
          </span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Model, rig, or user…"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-10 pr-4 py-2.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-emerald)] transition-colors"
          />
        </div>
      </form>

      {q && (
        <div className="mt-4 text-[11px] font-mono text-[var(--color-ink-3)] tabular-nums">
          {totalHits} match{totalHits === 1 ? "" : "es"} · {modelHits.length} model
          {modelHits.length === 1 ? "" : "s"} · {rigHits.length} rig
          {rigHits.length === 1 ? "" : "s"} · {userHits.length} user
          {userHits.length === 1 ? "" : "s"}
        </div>
      )}

      {!q && (
        <p className="mt-6 text-sm text-[var(--color-ink-2)] max-w-xl leading-relaxed">
          Search across every model, hardware tag, and nickname on the board.
          Or browse directly:{" "}
          <Link href="/leaderboard" className="underline hover:text-[var(--color-emerald)]">
            models
          </Link>
          {" · "}
          <Link
            href="/leaderboard/hardware"
            className="underline hover:text-[var(--color-emerald)]"
          >
            hardware
          </Link>
          {" · "}
          <Link
            href="/leaderboard/users"
            className="underline hover:text-[var(--color-emerald)]"
          >
            users
          </Link>
          .
        </p>
      )}

      {q && totalHits === 0 && (
        <p className="mt-10 text-sm text-[var(--color-ink-3)]">
          Nothing matches <span className="font-mono">&quot;{q}&quot;</span>. Try a
          shorter fragment (model family, GPU name, nickname).
        </p>
      )}

      {modelHits.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight mb-4">
            Models
          </h2>
          <div className="rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] overflow-hidden">
            {modelHits.map((m) => (
              <Link
                key={m.slug}
                href={`/models/${m.slug}`}
                prefetch={false}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_auto] items-center gap-4 px-4 py-2.5 border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors"
              >
                <span>
                  <span className="font-semibold text-[var(--color-ink)]">
                    {m.displayName}
                  </span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                    {m.provider}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <BenchBar value={m.pipelineScore} strong />
                </span>
                <TierBadge tier={m.tier} size="sm" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {rigHits.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight mb-4">
            Rigs
          </h2>
          <div className="rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] overflow-hidden">
            {rigHits.map((r) => (
              <Link
                key={r.tag}
                href={`/leaderboard/users?hardware=${encodeURIComponent(r.tag)}`}
                prefetch={false}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_180px_auto] items-center gap-4 px-4 py-2.5 border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors"
              >
                <span>
                  <span className="font-mono text-[13px] font-semibold text-[var(--color-ink)]">
                    {r.tag}
                  </span>
                  <span className="ml-2 text-xs text-[var(--color-ink-3)]">
                    best: {r.bestModel.displayName} · {r.runs} run{r.runs === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <BenchBar value={r.bestScore} strong />
                </span>
                <TierBadge tier={r.bestTier} size="sm" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {userHits.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight mb-4">
            Users
          </h2>
          <div className="rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] overflow-hidden">
            {userHits.map((u) => (
              <Link
                key={u.userNickname}
                href={`/users/${encodeURIComponent(u.userNickname)}`}
                prefetch={false}
                className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors"
              >
                <span className="font-medium text-[var(--color-ink)]">
                  {u.userNickname}
                  <span className="ml-2 text-xs text-[var(--color-ink-3)]">
                    {u.submissionCount} run{u.submissionCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-sm font-semibold text-[var(--color-ink)]">
                  {u.bestScore.toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
