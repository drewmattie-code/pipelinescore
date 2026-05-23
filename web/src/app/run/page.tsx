import { PasteToAI } from "@/components/PasteToAI";

export const metadata = {
  title: "Run a benchmark · PipelineScore",
  description:
    "One npx command, your own API key, a deterministic PipelineScore in under five minutes.",
};

const PROVIDERS = [
  { id: "anthropic", model: "claude-opus-4-7", label: "Anthropic" },
  { id: "openai", model: "gpt-5-5", label: "OpenAI" },
  { id: "google", model: "gemini-2-5-pro", label: "Google" },
  { id: "mistral", model: "mistral-large-2", label: "Mistral" },
  { id: "cohere", model: "command-r-plus", label: "Cohere" },
  { id: "ollama", model: "llama-4-405b", label: "Ollama (local)" },
];

export default function RunPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-20">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Get started
      </span>
      <h1 className="display text-4xl md:text-5xl font-semibold tracking-tight text-[var(--color-ink)] mt-3">
        Run your first benchmark.
      </h1>
      <p className="text-lg text-[var(--color-ink-2)] mt-5 leading-relaxed">
        Three minutes. No account. Bring your own API key — we never see or
        store it. The CLI calls your model, captures the transcripts, and
        submits them for server-side re-judgment.
      </p>

      <div className="mt-10 rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-ink)] text-white p-6 md:p-7 font-mono text-sm md:text-base overflow-x-auto shadow-sm">
        <span className="text-[var(--color-ink-3)] select-none">$ </span>
        <span className="text-white">npx @pipelinescore/cli run </span>
        <span className="text-[var(--color-emerald-light)]">--provider anthropic</span>{" "}
        <span className="text-[var(--color-emerald-light)]">--model claude-opus-4-7</span>{" "}
        <span className="text-[var(--color-emerald-light)]">--user your-handle</span>
      </div>

      <p className="text-sm text-[var(--color-ink-3)] mt-3">
        You&apos;ll be prompted for your provider API key, which is read once
        from your environment and discarded on exit.
      </p>

      <div className="mt-12">
        <PasteToAI />
      </div>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Supported providers
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-2 mb-6">
          Stock providers, plus any OpenAI-compatible endpoint via{" "}
          <code className="font-mono text-[var(--color-emerald)]">--base-url</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-5 font-mono text-sm flex flex-col gap-2"
            >
              <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] not-italic font-sans">
                {p.label}
              </span>
              <span className="text-[var(--color-ink)]">
                --provider <span className="text-[var(--color-emerald)]">{p.id}</span>{" "}
                --model{" "}
                <span className="text-[var(--color-emerald)]">{p.model}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] mb-8">
          What happens when you run it
        </h2>
        <ol className="flex flex-col gap-6">
          <Step n={1} title="Fetch today's signed test pack">
            The CLI pulls the rotating 30-task pack from{" "}
            <code className="font-mono text-[var(--color-emerald)]">
              api.pipelinescore.ai/v1/testpack
            </code>{" "}
            — same pack for every submission today, different tomorrow.
          </Step>
          <Step n={2} title="Run your model">
            Each task is sent to the provider you chose. Inputs, outputs,
            timings, and token counts are captured locally.
          </Step>
          <Step n={3} title="Submit for re-judgment">
            Transcripts are uploaded and re-graded server-side by a held-out
            judge model. Your local score is provisional; the server&apos;s is
            canonical.
          </Step>
          <Step n={4} title="See your card">
            You get a tier badge, a category breakdown, and a shareable URL —
            ready for the leaderboard.
          </Step>
        </ol>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-5">
      <span
        className="shrink-0 mt-1 font-mono text-xs text-[var(--color-emerald)] tracking-wider"
      >
        0{n}
      </span>
      <div>
        <h3 className="font-semibold text-[var(--color-ink)]">{title}</h3>
        <p className="text-[var(--color-ink-2)] leading-relaxed mt-1">{children}</p>
      </div>
    </li>
  );
}
