import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[color:var(--color-bg)]/80 border-b border-[var(--color-line-2)]">
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--color-ink)] font-semibold tracking-tight"
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: "var(--color-emerald)" }}
            aria-hidden
          />
          PipelineScore
        </Link>
        <form action="/search" className="hidden sm:block flex-1 max-w-[240px] mx-6">
          <input
            type="search"
            name="q"
            placeholder="Search models, rigs, users…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search"
            className="w-full px-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-line-2)] text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-emerald)] transition-colors"
          />
        </form>
        <nav className="flex items-center gap-5 md:gap-7 text-sm text-[var(--color-ink)] font-medium overflow-x-auto">
          <Link href="/" className="hover:text-[var(--color-emerald)] transition-colors">
            Home
          </Link>
          <Link href="/leaderboard" className="hover:text-[var(--color-emerald)] transition-colors">
            Models
          </Link>
          <Link href="/leaderboard/hardware" className="hover:text-[var(--color-emerald)] transition-colors">
            Hardware
          </Link>
          <Link href="/leaderboard/users" className="hover:text-[var(--color-emerald)] transition-colors">
            Users
          </Link>
          <Link href="/methodology" className="hover:text-[var(--color-emerald)] transition-colors">
            Methodology
          </Link>
          <Link href="/run" className="hover:text-[var(--color-emerald)] transition-colors">
            Run
          </Link>
          <Link href="/about" className="hover:text-[var(--color-emerald)] transition-colors">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
