import Link from "next/link";

export const metadata = {
  title: "About",
  description: "PipelineScore is a user-run LLM benchmark built by Charles & Roe.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-24">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        About
      </span>
      <h1 className="display text-4xl md:text-5xl font-semibold tracking-tight text-[var(--color-ink)] mt-3">
        Run it on your setup. Find out where you actually rank.
      </h1>

      <div className="mt-10 flex flex-col gap-6 text-[var(--color-ink-2)] leading-relaxed text-lg">
        <p>
          Existing LLM leaderboards measure either preference votes (LMArena),
          aggregated lab benchmarks (Artificial Analysis), or single-shot
          academic tests that decay fast (MMLU, SWE-Bench). None of them tell
          you what your model does on your account, with your key, against a
          fresh test pack.
        </p>
        <p>
          PipelineScore is the user-run version. You download a small CLI,
          run a standardized 30-task suite against any provider, and get back a
          deterministic 0–100 score, a tier badge, and a public submission
          page. Every submission is re-judged server-side by a held-out judge
          model to prevent gaming.
        </p>
        <p>
          Six categories — code, reasoning, writing, tool use, RAG, and speed
          — weighted to reflect real-world LLM usage. Five tiers — TRUNK
          through DRIP — borrowed from the language of actual pipelines. One
          number that means the same thing for everyone who runs it on the
          same day.
        </p>
        <p>
          Built by{" "}
          <a
            href="https://charlesandroe.com"
            className="text-[var(--color-emerald)] hover:text-[var(--color-emerald-dark)] underline-offset-4 hover:underline"
          >
            Charles &amp; Roe
          </a>
          . Part of a small portfolio of operator-grade tools for people who
          ship things that matter.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/run"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-ink)] text-white text-sm font-medium hover:bg-[var(--color-emerald)] transition-colors"
        >
          Run a benchmark
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] text-sm font-medium hover:border-[var(--color-ink-3)] transition-colors"
        >
          See the leaderboard
        </Link>
      </div>
    </div>
  );
}
