import Link from "next/link";
import { getUserLeaderboard, getUserDirectory } from "@/lib/api";
import type { UserLeaderboardQuery } from "@/lib/api";
import { TIER_BY_ID } from "@/lib/tiers";
import { SearchInput } from "@/components/SearchInput";

export const metadata = {
  title: "Users · PipelineScore",
  description:
    "Every PipelineScore run, every user, every model. Sortable, filterable. The community board.",
};

const PAGE_SIZE = 100;

export default async function UsersLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const query: UserLeaderboardQuery = {
    provider: sp.provider,
    tier: sp.tier,
    search: sp.search,
    sort: (sp.sort as UserLeaderboardQuery["sort"]) ?? "score",
    dir: (sp.dir as "asc" | "desc") ?? "desc",
    labVerified: sp.lab === "1",
    limit: PAGE_SIZE,
    offset: Number(sp.offset ?? 0) || 0,
  };

  const [page, directory] = await Promise.all([
    getUserLeaderboard(query),
    getUserDirectory(),
  ]);

  const providers = Array.from(new Set(page.entries.map((e) => e.model.provider))).sort();
  const tiers = ["trunk", "mainline", "feeder", "tap", "drip"];

  const filtersActive = !!(query.provider || query.tier || query.labVerified || query.search);
  const baseParams = new URLSearchParams();
  if (query.provider) baseParams.set("provider", query.provider);
  if (query.tier) baseParams.set("tier", query.tier);
  if (query.search) baseParams.set("search", query.search);
  if (query.labVerified) baseParams.set("lab", "1");

  function sortHref(col: NonNullable<UserLeaderboardQuery["sort"]>) {
    const next = new URLSearchParams(baseParams);
    next.set("sort", col);
    const flip = query.sort === col && query.dir === "desc" ? "asc" : "desc";
    next.set("dir", flip);
    return `?${next.toString()}`;
  }

  function pageHref(offset: number) {
    const next = new URLSearchParams(baseParams);
    if (query.sort) next.set("sort", query.sort);
    if (query.dir) next.set("dir", query.dir);
    if (offset > 0) next.set("offset", String(offset));
    return next.toString() ? `?${next.toString()}` : "/leaderboard/users";
  }

  function filterHref(key: string, value: string | null) {
    const next = new URLSearchParams(baseParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    // Reset offset on filter change
    next.delete("offset");
    return next.toString() ? `?${next.toString()}` : "/leaderboard/users";
  }

  const arrow = (col: string) => {
    if (query.sort !== col) return <span className="text-[var(--color-ink-3)]">↕</span>;
    return <span className="text-[var(--color-ink)]">{query.dir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20">
      <div className="max-w-3xl">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          User Leaderboard
        </span>
        <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
          Every run. Every user.
        </h1>
        <p className="text-lg text-[var(--color-ink-2)] mt-4 leading-relaxed">
          {page.total.toLocaleString()} submission{page.total === 1 ? "" : "s"} from {directory.length.toLocaleString()} user{directory.length === 1 ? "" : "s"}. Sort, filter, find someone who ran your model.
        </p>
        <div className="mt-4 text-sm text-[var(--color-ink-3)]">
          Want on the board? <Link href="/run" className="underline hover:text-[var(--color-emerald)]">Run the CLI</Link>.
        </div>
      </div>

      {/* Search */}
      <div className="mt-8">
        <SearchInput placeholder="Search by nickname…" />
        {query.search && (
          <div className="mt-2 text-xs text-[var(--color-ink-3)]">
            Showing matches for <span className="font-mono text-[var(--color-ink)]">&quot;{query.search}&quot;</span> — {page.total.toLocaleString()} result{page.total === 1 ? "" : "s"}.
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] mr-2">Filter</div>

        <FilterChip label="All" href={filterHref("provider", null)} active={!query.provider && !query.labVerified} />
        {providers.map((p) => (
          <FilterChip
            key={p}
            label={p}
            href={filterHref("provider", p)}
            active={query.provider === p}
          />
        ))}

        <span className="text-[var(--color-line)]">|</span>

        {tiers.map((t) => (
          <FilterChip
            key={t}
            label={TIER_BY_ID[t as keyof typeof TIER_BY_ID]?.name ?? t.toUpperCase()}
            href={filterHref("tier", t)}
            active={query.tier === t}
            color={TIER_BY_ID[t as keyof typeof TIER_BY_ID]?.color}
          />
        ))}

        <span className="text-[var(--color-line)]">|</span>
        <FilterChip
          label="Lab-verified only"
          href={filterHref("lab", query.labVerified ? null : "1")}
          active={!!query.labVerified}
        />

        {filtersActive && (
          <Link
            href="/leaderboard/users"
            className="ml-auto text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)] underline"
          >
            Clear filters
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="mt-8 rounded-3xl border border-[var(--color-line-2)] bg-[var(--color-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-bg)]/60 border-b border-[var(--color-line-2)]">
              <tr className="text-left text-[var(--color-ink-3)] uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3"><SortLink href={sortHref("user")} label="User" arrow={arrow("user")} /></th>
                <th className="px-4 py-3"><SortLink href={sortHref("model")} label="Model" arrow={arrow("model")} /></th>
                <th className="px-4 py-3 hidden md:table-cell"><SortLink href={sortHref("provider")} label="Provider" arrow={arrow("provider")} /></th>
                <th className="px-4 py-3 hidden xl:table-cell">Config</th>
                <th className="px-4 py-3 text-right"><SortLink href={sortHref("score")} label="Score" arrow={arrow("score")} /></th>
                <th className="px-4 py-3"><SortLink href={sortHref("tier")} label="Tier" arrow={arrow("tier")} /></th>
                <th className="px-4 py-3 hidden lg:table-cell"><SortLink href={sortHref("date")} label="Date" arrow={arrow("date")} /></th>
              </tr>
            </thead>
            <tbody>
              {page.entries.map((e, i) => {
                const tier = TIER_BY_ID[e.tier];
                return (
                  <tr
                    key={e.submissionId}
                    className="border-b border-[var(--color-line-2)] last:border-b-0 hover:bg-[color:var(--color-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-ink-3)] font-mono text-xs">
                      {query.offset! + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/users/${encodeURIComponent(e.userNickname)}`}
                        className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors font-medium"
                      >
                        {e.userNickname}
                      </Link>
                      {e.labVerified && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-emerald)] font-semibold">
                          Lab
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/models/${e.model.slug}`}
                        className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                      >
                        {e.model.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--color-ink-2)] uppercase text-xs tracking-wider">
                      {e.model.provider}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {e.configTag ? (
                        <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[color:var(--color-line-2)] text-[var(--color-ink-2)]">
                          {e.configTag}
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">base</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[var(--color-ink)]">
                      {e.pipelineScore.toFixed(1)}
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
                      {e.submittedAt.slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
              {page.entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-ink-3)]">
                    No submissions match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {page.total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-between text-sm text-[var(--color-ink-2)]">
          <div className="font-mono text-xs text-[var(--color-ink-3)]">
            {query.offset! + 1}–{query.offset! + page.entries.length} of {page.total.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            {query.offset! > 0 && (
              <Link
                href={pageHref(Math.max(0, query.offset! - PAGE_SIZE))}
                className="px-3 py-1.5 rounded-full border border-[var(--color-line)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
              >
                ← Previous
              </Link>
            )}
            {query.offset! + PAGE_SIZE < page.total && (
              <Link
                href={pageHref(query.offset! + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-full border border-[var(--color-line)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Top reviewers panel */}
      <section className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Top reviewers
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1 mb-8">
          By best PipelineScore submitted. Click a user to open their dashboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {directory.slice(0, 12).map((u, i) => (
            <Link
              key={u.userNickname}
              href={`/users/${encodeURIComponent(u.userNickname)}`}
              className="group flex items-center justify-between rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-emerald)] transition-colors"
            >
              <div>
                <div className="text-xs font-mono text-[var(--color-ink-3)]">#{i + 1}</div>
                <div className="text-base font-medium text-[var(--color-ink)] group-hover:text-[var(--color-emerald)] transition-colors mt-1">
                  {u.userNickname}
                </div>
                <div className="text-xs text-[var(--color-ink-3)] mt-1">
                  {u.submissionCount} run{u.submissionCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="font-mono tabular-nums text-2xl font-semibold text-[var(--color-ink)]">
                {u.bestScore.toFixed(1)}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-16 text-center">
        <Link
          href="/leaderboard"
          className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)] underline"
        >
          ← Switch to model leaderboard
        </Link>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
  color,
}: {
  label: string;
  href: string;
  active: boolean;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={`text-xs uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "border-[var(--color-emerald)] text-[var(--color-emerald)] font-semibold"
          : "border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
      }`}
      style={color && active ? { borderColor: color, color } : undefined}
    >
      {label}
    </Link>
  );
}

function SortLink({
  href,
  label,
  arrow,
}: {
  href: string;
  label: string;
  arrow: React.ReactNode;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 hover:text-[var(--color-ink)] transition-colors">
      {label} {arrow}
    </Link>
  );
}
