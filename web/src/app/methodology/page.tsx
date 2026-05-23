import Link from "next/link";
import { TIERS, CATEGORY_LABELS } from "@/lib/tiers";
import { TierBadge } from "@/components/TierBadge";

export const metadata = {
  title: "Methodology · PipelineScore",
  description:
    "How the PipelineScore is computed. Six weighted categories, a deterministic 0–100 score, five tiers, and server-side anti-cheat re-judgment.",
};

const CATEGORIES: {
  id: keyof typeof CATEGORY_LABELS;
  weight: string;
  tests: string;
}[] = [
  { id: "code", weight: "25%", tests: "Code generation, debugging, refactoring, test writing — runnable, gradeable code." },
  { id: "reason", weight: "20%", tests: "Multi-step reasoning, math, logic, strict instruction following." },
  { id: "write", weight: "15%", tests: "Drafting, summarization, style adherence, tone control." },
  { id: "tool_use", weight: "15%", tests: "Function calling correctness, parameter selection, orchestration, graceful refusal." },
  { id: "rag", weight: "12%", tests: "Grounded answering, citation accuracy, faithfulness, refusal to fabricate." },
  { id: "speed", weight: "13%", tests: "Latency (p50, p95) and tokens/sec under a standardized load." },
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
        PipelineScore is a deterministic 0–100 number, computed from six
        weighted categories that mirror real-world LLM workloads. Same test
        pack, same judge, same math — every model gets the same shot.
      </p>

      <Section title="The formula">
        <pre className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface-2)] p-5 font-mono text-sm overflow-x-auto text-[var(--color-ink)]">
{`PipelineScore = Σ (category_score × weight)

category_score = normalized 0-100 against the v1 anchor
weights sum to 1.0`}
        </pre>
        <p className="text-[var(--color-ink-2)] leading-relaxed mt-5">
          Deterministic tests (code execution, exact-match, schema validation)
          score pass/fail with a difficulty multiplier. Subjective tests
          (writing quality, summarization) are scored 0–10 against a rubric by
          a held-out judge model.
        </p>
      </Section>

      <Section title="The six categories">
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
            <strong>Public taxonomy, private prompts.</strong>{" "}
            The six categories and their task types are open. The exact prompts
            rotate daily and are HMAC-signed per-day, so a cached pack from
            yesterday won&apos;t pass today&apos;s server-side check.
          </Bullet>
          <Bullet>
            <strong>Server-side re-judgment.</strong>{" "}
            Every submission is re-graded centrally by a held-out judge model
            (Claude Haiku 4.5). The CLI&apos;s local score is provisional —
            only the server&apos;s number lands on the board.
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
