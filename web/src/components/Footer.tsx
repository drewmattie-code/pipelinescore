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
        <div className="flex items-center gap-6 flex-wrap">
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
          <Link href="/privacy" className="hover:text-[var(--color-emerald)] transition-colors">
            Privacy
          </Link>
          <a href="mailto:drew@stimpmedia.com" className="hover:text-[var(--color-emerald)] transition-colors">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
