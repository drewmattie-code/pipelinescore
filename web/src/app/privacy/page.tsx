import Link from "next/link";

export const metadata = {
  title: "Privacy & Data · PipelineScore",
  description:
    "What PipelineScore stores, for how long, and how the retention policy is enforced. Plain English. No dark patterns.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-20">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Privacy & data
      </span>
      <h1 className="display text-4xl md:text-5xl font-semibold tracking-tight text-[var(--color-ink)] mt-3">
        What we store. How long. Why.
      </h1>
      <p className="text-lg text-[var(--color-ink-2)] mt-5 leading-relaxed">
        PipelineScore is a public benchmark. The leaderboard{" "}
        <em>is</em> the product. The only way to keep that responsible is a
        strict retention policy on the things that don&apos;t need to live
        forever — and a public statement of what those things are.
      </p>

      <Section title="Stored permanently">
        <p>
          The signal of the benchmark itself. Removing any of these would break
          the leaderboard.
        </p>
        <Bullets
          items={[
            "Model identity (slug, provider, family, release date)",
            "Composite PipelineScore, tier, per-category scores",
            "The nickname you chose with --user",
            "Submission timestamp and lab-verified flag",
            "Your optional --config-tag (LoRA / system-prompt / persona / etc.)",
            "Which CLI version submitted",
          ]}
        />
      </Section>

      <Section title="Stored for 30 days, then redacted">
        <p>
          The body of each run. We keep it for ~30 days so you can audit your
          score, file a dispute, or share it. After 30 days we overwrite these
          fields with{" "}
          <code className="font-mono text-[var(--color-emerald)]">
            [redacted:30d_ttl]
          </code>{" "}
          — the score row stays, the body is gone.
        </p>
        <Bullets
          items={[
            "Raw prompt + response transcripts",
            "Per-task input + model output text",
            "Judge rationales",
          ]}
        />
        <p>
          <strong>Why:</strong> users sometimes submit prompts or outputs that
          accidentally contain PII, API keys, or proprietary docs. Keeping
          those bodies indefinitely would compound risk every day. Thirty days
          is long enough to audit, short enough to limit liability.
        </p>
      </Section>

      <Section title="Stored for 90 days">
        <p>
          Lightweight request metadata to power product analytics, abuse
          detection, and aggregated reporting. No request bodies — just shape.
        </p>
        <Bullets
          items={[
            "HTTP method, path, status code, latency",
            "IP address (for rate-limit enforcement)",
            "User-agent string",
            "Nickname, when the request was tied to one",
          ]}
        />
        <p>
          Rolling 90-day window. Older events are hard-deleted by a background
          job.
        </p>
      </Section>

      <Section title="Never stored">
        <Bullets
          items={[
            "Your API key. The CLI calls Anthropic/OpenAI/your local endpoint directly with your key — the backend never sees it.",
            "Request or response payloads beyond the fields listed above.",
            "Email, real name, or any personal info beyond the nickname you typed.",
          ]}
        />
      </Section>

      <Section title="How it's enforced">
        <p>
          A background job in the API server runs on startup and every hour.
          It overwrites transcripts on submissions older than 30 days,
          hard-deletes event-log rows older than 90 days, and logs the row
          counts to stdout so the operator (Charles & Roe) can verify.
        </p>
        <p>
          The implementation is open: see{" "}
          <code className="font-mono text-[var(--color-emerald)]">
            backend/src/lib/retention.ts
          </code>{" "}
          in the repository. You can verify on any submission by checking
          whether{" "}
          <code className="font-mono text-[var(--color-emerald)]">
            raw_transcripts
          </code>{" "}
          contains{" "}
          <code className="font-mono text-[var(--color-emerald)]">
            &quot;redacted&quot;:true
          </code>
          .
        </p>
      </Section>

      <Section title="Rate limits">
        <p>To prevent leaderboard flooding and scraping, the backend enforces:</p>
        <Bullets
          items={[
            "200 reads per IP per minute",
            "20 submits per IP per hour",
            "100 submits per nickname per day",
            "5 submits per (nickname, model) per hour",
          ]}
        />
        <p>
          When you hit a limit you get a{" "}
          <code className="font-mono text-[var(--color-emerald)]">429</code>{" "}
          response with{" "}
          <code className="font-mono text-[var(--color-emerald)]">
            RateLimit-*
          </code>{" "}
          headers and a JSON error body identifying which layer fired. The CLI
          handles this gracefully — your local score is still computed.
        </p>
      </Section>

      <Section title="What if I want my nickname off the board?">
        <p>
          Email{" "}
          <a
            href="mailto:privacy@pipelinescore.ai"
            className="text-[var(--color-emerald)] hover:text-[var(--color-emerald-dark)] underline-offset-4 hover:underline"
          >
            privacy@pipelinescore.ai
          </a>{" "}
          with the nickname and we&apos;ll redact it. Since there&apos;s no
          auth, we can&apos;t verify ownership of a nickname — if someone
          impersonates you, that&apos;s the trade-off of an auth-less system.
          We&apos;ll redact on a good-faith basis.
        </p>
      </Section>

      <div className="mt-16 flex flex-wrap gap-3">
        <Link
          href="/run"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-ink)] text-white text-sm font-medium hover:bg-[var(--color-emerald)] transition-colors"
        >
          Run a benchmark
        </Link>
        <Link
          href="/about"
          className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-[var(--color-line)] text-[var(--color-ink)] text-sm font-medium hover:border-[var(--color-ink-3)] transition-colors"
        >
          About PipelineScore
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] mb-4">
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-[var(--color-ink-2)] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 pl-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-[var(--color-emerald)] shrink-0 mt-1.5">•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
