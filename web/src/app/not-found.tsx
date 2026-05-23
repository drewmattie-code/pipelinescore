import Link from "next/link";

export const metadata = {
  title: "Not found",
  description: "We couldn't find that page on PipelineScore.",
};

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-24 text-center">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Error · 404
      </span>
      <h1 className="display text-5xl md:text-7xl font-extrabold tracking-tight text-[var(--color-ink)] mt-4">
        DRIP tier page.
      </h1>
      <p className="text-lg text-[var(--color-ink)] mt-6 leading-relaxed max-w-xl mx-auto">
        Whatever you were looking for didn&apos;t score well enough to make
        the board. Or the URL is just wrong.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-ink)] text-white text-sm font-semibold hover:bg-[var(--color-emerald)] transition-colors"
        >
          ← Home
        </Link>
        <Link
          href="/leaderboard/users"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] text-sm font-semibold hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
        >
          Users Leaderboard
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] text-sm font-semibold hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
        >
          Models Leaderboard
        </Link>
      </div>
    </div>
  );
}
