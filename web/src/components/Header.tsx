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
        <nav className="flex items-center gap-7 text-sm text-[var(--color-ink-2)]">
          <Link href="/leaderboard" className="hover:text-[var(--color-ink)] transition-colors">
            Leaderboard
          </Link>
          <Link href="/methodology" className="hover:text-[var(--color-ink)] transition-colors">
            Methodology
          </Link>
          <Link href="/run" className="hover:text-[var(--color-ink)] transition-colors">
            Run
          </Link>
          <Link href="/about" className="hover:text-[var(--color-ink)] transition-colors">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
