import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-[var(--color-line-2)] mt-32">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-[var(--color-ink-2)]">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "var(--color-emerald)" }}
            aria-hidden
          />
          <span>PipelineScore — user-run LLM benchmarking.</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/leaderboard" className="hover:text-[var(--color-ink)] transition-colors">
            Leaderboard
          </Link>
          <Link href="/methodology" className="hover:text-[var(--color-ink)] transition-colors">
            Methodology
          </Link>
          <Link href="/run" className="hover:text-[var(--color-ink)] transition-colors">
            Run a benchmark
          </Link>
          <Link href="/about" className="hover:text-[var(--color-ink)] transition-colors">
            About
          </Link>
        </div>
      </div>
    </footer>
  );
}
