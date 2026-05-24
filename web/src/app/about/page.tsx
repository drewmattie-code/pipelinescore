import Link from "next/link";

export const metadata = {
  title: "About",
  description: "PipelineScore is a user-run LLM benchmark built by SaaSquach AI Labs (a division of Charles & Roe Inc.).",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-24">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        About
      </span>
      <h1 className="display text-4xl md:text-5xl font-bold tracking-tight text-[var(--color-ink)] mt-3">
        The missing axis: <em>where</em> the model is running.
      </h1>

      <div className="mt-10 flex flex-col gap-6 text-[var(--color-ink)] leading-relaxed text-lg">
        <p>
          Every other public LLM leaderboard tells you which model is best in
          the abstract. <strong>LMArena</strong> measures preference votes.{" "}
          <strong>Artificial Analysis</strong> aggregates centrally-run
          benchmarks. <strong>Academic tests</strong> (MMLU, SWE-Bench,
          TerminalBench) are lab-controlled and decay fast as models train on
          them.
        </p>
        <p>
          None of them answer the question that actually matters to anyone
          running a model: <em>how well does this model run on the hardware
          I have?</em> Llama 4 on an M3 Max is not the same product as Llama 4
          on a 3090 or Llama 4 on an A100. Same weights, three radically
          different real-world experiences.
        </p>
        <p>
          PipelineScore is the local-first benchmark. You point a CLI at your
          local model server (Ollama, LM Studio, MLX, llama.cpp), tag your
          hardware, and the 25-task suite runs against your rig. The score and
          tier land on a public leaderboard that&apos;s grouped by{" "}
          <span className="font-mono text-[var(--color-emerald)]">(model, hardware)</span>{" "}
          — so the M3 Max + Llama 4 cohort gets its own row, separate from the
          3090 + Llama 4 cohort.
        </p>
        <p>
          Six categories — code, reasoning, writing, tool use, RAG, and speed —
          weighted to reflect real-world LLM usage. Five tiers — TRUNK through
          DRIP — borrowed from the language of actual pipelines. Frontier API
          runs (Anthropic, OpenAI) work too, but the unique value lives in the
          local-hardware comparisons no one else publishes.
        </p>
        <p>
          Open source under Apache 2.0. Code at{" "}
          <a
            href="https://github.com/drewmattie-code/pipelinescore"
            className="text-[var(--color-emerald)] hover:text-[var(--color-emerald-dark)] underline-offset-4 hover:underline"
          >
            github.com/drewmattie-code/pipelinescore
          </a>
          . Built by an operator who runs LLMs on a small fleet of machines and
          wanted a way to compare them.
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
