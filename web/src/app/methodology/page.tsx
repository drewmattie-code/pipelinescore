import Link from "next/link";
import { TIERS, CATEGORY_LABELS } from "@/lib/tiers";
import { TierBadge } from "@/components/TierBadge";

export const metadata = {
  title: "Methodology",
  description:
    "How the PipelineScore is computed. Five deterministic categories scored locally with no API key, confidence bands, selectable weighting profiles, throughput-based speed, five tiers, and a public set plus a private rotating held-out set for lab-verified runs.",
};

const CATEGORIES: {
  id: keyof typeof CATEGORY_LABELS;
  weight: string;
  tests: string;
}[] = [
  { id: "code", weight: "28%", tests: "Code generation, debugging, refactoring — the model's code is executed against hidden test cases." },
  { id: "reason", weight: "22%", tests: "Multi-step reasoning, math, logic — the final answer is exact-matched." },
  { id: "tool_use", weight: "18%", tests: "Function-calling: the emitted tool call is JSON-matched against the expected structure." },
  { id: "rag", weight: "17%", tests: "Grounded extraction and structured answering, JSON-matched against the context." },
  { id: "speed", weight: "15%", tests: "Throughput (tokens/sec) measured on your hardware during the run." },
];

export default function MethodologyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-20">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Methodology
      </span>
      <h1 className="display text-4xl md:text-5xl font-semibold tracking-tight text-[var(--color-ink)] mt-3">
        How the score works.
      </h1>
      <p className="text-lg text-[var(--color-ink-2)] mt-5 leading-relaxed">
        PipelineScore is a 0–100 number computed from five categories that mirror
        real-world LLM workloads, reported with a <strong>confidence band</strong>{" "}
        so two models that are statistically tied read as tied. Every task is
        checked objectively, so the whole benchmark runs <strong>on your machine
        with no API key</strong>, then the result uploads to the board. Pick a{" "}
        <strong>weighting profile</strong> to rank for your use case.
      </p>

      <Section title="The formula">
        <pre className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface-2)] p-5 font-mono text-sm overflow-x-auto text-[var(--color-ink)]">
{`category_score = mean(task scores, 0-100)  ± 95% confidence band
PipelineScore  = Σ (category_score × profile_weight)   (weights sum to 1.0)`}
        </pre>
        <p className="text-[var(--color-ink-2)] leading-relaxed mt-5">
          Each category is the mean of its task scores with a 95% confidence band
          (Student-t for small samples), so a noisy category shows a wider band and
          the band narrows as you add tasks. <strong>Every task is scored
          deterministically on your machine</strong>: code is executed against
          hidden test cases, answers are exact-matched, and tool calls and
          extractions are JSON-matched. There is no judge model and no API key.
          Speed is <strong>throughput (tokens/sec)</strong>, a rate, so it does not
          reward terse answers. The composite is computed per weighting profile
          (balanced, coding, agentic, local-first); the board leads with the
          per-category profile.
        </p>
      </Section>

      <Section title="The five categories">
        <div className="border-y border-[var(--color-line-2)]">
          {CATEGORIES.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[6rem_4rem_1fr] gap-6 py-5 border-b border-[var(--color-line-2)] last:border-b-0 items-baseline"
            >
              <div className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                {CATEGORY_LABELS[c.id]}
              </div>
              <div className="font-mono text-sm text-[var(--color-emerald)] tabular-nums">
                {c.weight}
              </div>
              <div className="text-sm text-[var(--color-ink-2)] leading-relaxed">
                {c.tests}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The tiers">
        <p className="text-[var(--color-ink-2)] leading-relaxed mb-6">
          Five tiers, named after the parts of a real industrial pipeline. A
          score maps to exactly one tier — no overlap, no ambiguity.
        </p>
        <div className="flex flex-col gap-3">
          {TIERS.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[8rem_1fr_8rem] gap-4 items-center py-3 border-b border-[var(--color-line-2)] last:border-b-0"
            >
              <TierBadge tier={t.id} size="md" />
              <div className="font-mono text-sm text-[var(--color-ink-2)] tabular-nums">
                {t.min} – {t.max}
              </div>
              <div className="text-xs text-[var(--color-ink-3)] text-right">
                {t.id === "trunk" && "Top of the heap — main industrial line."}
                {t.id === "mainline" && "Excellent and reliable service line."}
                {t.id === "feeder" && "Solid, capable secondary line."}
                {t.id === "tap" && "Functional small-branch connection."}
                {t.id === "drip" && "Minimal flow — weak."}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Config tags — same model, different setups">
        <p className="text-[var(--color-ink)] leading-relaxed">
          A vanilla{" "}
          <code className="font-mono text-[var(--color-emerald)]">claude-opus-4-7</code>{" "}
          and the same model wrapped in your custom system prompt or LoRA
          adapter are not the same thing. They should not collide on the board.
        </p>
        <p className="text-[var(--color-ink)] leading-relaxed mt-4">
          The CLI accepts a{" "}
          <code className="font-mono text-[var(--color-emerald)]">--config-tag</code>{" "}
          flag — a short, free-form string like{" "}
          <code className="font-mono text-[var(--color-emerald)]">system-prompt-coder</code>,{" "}
          <code className="font-mono text-[var(--color-emerald)]">lora-domain-finance</code>,
          or{" "}
          <code className="font-mono text-[var(--color-emerald)]">temp-zero</code>.
          The leaderboard shows it as a separate row from the base-model run,
          and you get a real apples-to-apples view of how much your
          customization actually moved the score.
        </p>
        <p className="text-[var(--color-ink)] leading-relaxed mt-4">
          Base-model submissions leave the tag blank. The {`"`}
          <span className="font-mono text-[var(--color-emerald)]">base</span>
          {`"`} marker on the Users Leaderboard means a default, unmodified run.
        </p>
      </Section>

      <Section title="Anti-cheat &amp; integrity">
        <ul className="flex flex-col gap-3 text-[var(--color-ink)] leading-relaxed">
          <Bullet>
            <strong>Public set, private held-out set.</strong>{" "}
            The community task set is open and reproducible — it ships bundled
            with the CLI, so a run is exactly the published tasks. A separate
            private, rotating held-out set is used for canonical lab-verified
            runs, so the trusted ranking cannot be trained on or pre-tuned
            against.
          </Bullet>
          <Bullet>
            <strong>Community vs lab-verified.</strong>{" "}
            Community submissions are computed locally by the CLI and are labeled
            community, not verified — treat them as directional. The trusted
            ranking is the lab-verified tier, run by the lab against the private
            rotating held-out task set so it cannot be pre-tuned against.
          </Bullet>
          <Bullet>
            <strong>Layered rate limits.</strong>{" "}
            20 submissions per IP per hour, 100 per nickname per day, and
            5 per (nickname, model) per hour. 429s return a stamped JSON
            error identifying which layer fired, with a{" "}
            <code className="font-mono text-[var(--color-emerald)]">Retry-After</code>{" "}
            header.
          </Bullet>
          <Bullet>
            <strong>Lab-verified flag.</strong>{" "}
            A small set of runs published by Charles &amp; Roe under controlled
            conditions are tagged{" "}
            <span className="text-[var(--color-emerald)] uppercase text-[10px] tracking-wider font-semibold">
              Lab
            </span>{" "}
            on the board. Community submissions stay on the leaderboard
            permanently — the score is the score.
          </Bullet>
          <Bullet>
            <strong>Nicknames aren&apos;t authenticated, by design.</strong>{" "}
            We don&apos;t verify that the person submitting as &quot;karpathy&quot;
            is Andrej. The leaderboard is signal-grade, not reputation-graded.
            If someone impersonates you, email{" "}
            <a
              href="mailto:privacy@pipelinescore.ai"
              className="text-[var(--color-emerald)] hover:underline"
            >
              privacy@pipelinescore.ai
            </a>{" "}
            and we&apos;ll redact on a good-faith basis.
          </Bullet>
          <Bullet>
            <strong>30-day transcript retention.</strong>{" "}
            Raw prompt + model-output bodies are kept for 30 days for audit,
            then overwritten. The score row is permanent. See{" "}
            <Link
              href="/privacy"
              className="text-[var(--color-emerald)] hover:underline"
            >
              Privacy
            </Link>{" "}
            for the full policy.
          </Bullet>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] mb-6">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-2.5 w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: "var(--color-emerald)" }}
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}
