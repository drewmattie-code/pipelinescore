import Link from "next/link";
import { DataUnavailable } from "@/components/DataUnavailable";
import { getHardwareBoard, getLeaderboardModels, getStats } from "@/lib/api";
import { BenchTable } from "@/components/BenchTable";
import { CopyCommand } from "@/components/CopyCommand";
import { CATEGORY_LABELS, CATEGORY_WEIGHTS, TIERS } from "@/lib/tiers";
import { modelMatchups, rigMatchups } from "@/lib/matchups";

// The board reflects live submission state. force-dynamic keeps it fresh on
// every request — no stale cached homepage.
export const dynamic = "force-dynamic";

// Zero-config since CLI 0.4.0: probes Ollama / LM Studio / llama.cpp / MLX /
// vLLM / LiteLLM, lists the models actually being served, auto-detects
// hardware, asks a nickname once. No flags to get wrong.
const RUN_COMMAND = "npx @pipelinescore/cli";

export default async function Home() {
  const [models, stats, rigs] = await Promise.all([
    getLeaderboardModels(),
    getStats(),
    getHardwareBoard(),
  ]);
  const modelPairs = modelMatchups(models);
  const rigPairs = rigMatchups(rigs);

  return (
    <div className="flex flex-col">
      {/* Masthead — data-first, no hero. The board is the homepage. */}
      <section className="border-b border-[var(--color-line-2)] bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10 pt-12 md:pt-16 pb-8">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
            LLM benchmarks · v3 testpack · deterministic · no API key
          </div>
          <h1 className="display text-4xl md:text-6xl font-extrabold text-[var(--color-ink)] leading-[1.04] tracking-tight mt-4 max-w-3xl">
            Benchmark LLMs on YOUR hardware.
          </h1>
          <p className="text-base md:text-lg text-[var(--color-ink-2)] leading-relaxed mt-4 max-w-2xl">
            The same 34 deterministic tasks, scored entirely on your machine —
            no judge model, no API key, one 0–100 score. A catalog of{" "}
            {stats.model_count.toLocaleString()} models, ranked by runs people
            actually made on their own hardware. The only public LLM board that
            ranks <em>where</em> the model runs, not just which model it is.
          </p>
          <p className="text-sm text-[var(--color-ink-3)] leading-relaxed mt-3 max-w-2xl">
            Every score here is a real run. We seed nothing — which is why the
            board is small and why you can trust the numbers on it.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <CopyCommand command={RUN_COMMAND} />
          </div>
          <p className="text-xs text-[var(--color-ink-3)] mt-2 font-mono">
            That&apos;s the whole command. It finds your Ollama / LM Studio /
            llama.cpp / MLX server, lists your models, auto-detects your
            hardware, and walks you through the rest.
          </p>
          <div className="flex flex-wrap items-center gap-5 mt-5 text-sm font-semibold">
            <Link
              href="/run"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[var(--color-emerald)] text-white hover:bg-[var(--color-emerald-dark)] transition-colors"
            >
              Run on your hardware
            </Link>
            <Link
              href="/leaderboard/hardware"
              className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
            >
              Rank the rigs →
            </Link>
            <Link
              href="/leaderboard/users"
              className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
            >
              See where you&apos;d rank →
            </Link>
          </div>
        </div>

        {/* Instrument strip */}
        <div className="border-t border-[var(--color-line-2)] bg-[var(--color-ink)] text-white">
          <div className="max-w-7xl mx-auto px-6 md:px-10 py-3 flex flex-wrap items-center gap-x-8 gap-y-1 font-mono text-[11px] md:text-xs uppercase tracking-[0.14em]">
            <Stat label="Models tracked" value={stats.model_count} />
            <Stat label="Real runs" value={stats.submission_count} />
            <Stat label="Users" value={stats.user_count} />
            <span className="text-white/50">
              Testpack <span className="text-[var(--color-emerald-light)]">v3</span>
            </span>
            <span className="text-white/50">
              Tasks <span className="text-[var(--color-emerald-light)]">34</span>
            </span>
            <span className="text-white/50 hidden md:inline">
              Scored locally · server never re-scores
            </span>
          </div>
        </div>
      </section>

      {/* The board */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-10 md:mt-12">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[var(--color-ink)] tracking-tight">
              The model board
            </h2>
            <p className="text-sm text-[var(--color-ink-2)] mt-1">
              Best run per model. Click a column to re-rank, pick two rows to go
              head-to-head.
            </p>
          </div>
          <Link
            href="/methodology"
            className="text-sm text-[var(--color-emerald)] hover:text-[var(--color-emerald-dark)] font-semibold"
          >
            How scores are computed →
          </Link>
        </div>
        {models.length === 0 ? (
          <DataUnavailable eyebrow="Model board" subject="The board" inline />
        ) : (
          <BenchTable models={models} />
        )}
      </section>

      {/* Popular matchups — every chip is a live head-to-head */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-16 md:mt-20">
        <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">
          Popular matchups
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          The rivalries worth settling. Every pair opens a live head-to-head.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {modelPairs.map(([a, b]) => (
            <Link
              key={`${a.slug}|${b.slug}`}
              href={`/compare/${a.slug}/${b.slug}`}
              prefetch={false}
              className="px-3.5 py-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
            >
              {a.displayName} <span className="text-[var(--color-ink-3)]">vs</span>{" "}
              {b.displayName}
            </Link>
          ))}
        </div>
        {rigPairs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {rigPairs.map(([a, b]) => (
              <Link
                key={`${a.tag}|${b.tag}`}
                href={`/compare/hardware/${encodeURIComponent(a.tag)}/${encodeURIComponent(b.tag)}`}
                prefetch={false}
                className="px-3.5 py-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] text-sm font-mono text-[var(--color-ink)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)] transition-colors"
              >
                {a.tag} <span className="text-[var(--color-ink-3)] font-sans">vs</span>{" "}
                {b.tag}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Score anatomy: weights + tiers */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-16 md:mt-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">
              Five measures. One number.
            </h2>
            <p className="text-sm text-[var(--color-ink-2)] mt-1 leading-relaxed">
              Code is executed, reasoning is exact-match, tool use and RAG are
              JSON-match, speed is measured throughput. No judge model, no
              rubric, no API key.
            </p>
            <div className="grid grid-cols-5 gap-2 mt-5">
              {(Object.keys(CATEGORY_WEIGHTS) as Array<keyof typeof CATEGORY_WEIGHTS>).map(
                (c) => (
                  <div
                    key={c}
                    className="rounded-md border border-[var(--color-line-2)] bg-[var(--color-surface)] p-3 text-center"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                      {CATEGORY_LABELS[c]}
                    </div>
                    <div className="font-mono text-lg font-semibold text-[var(--color-ink)] mt-1 tabular-nums">
                      {Math.round(CATEGORY_WEIGHTS[c] * 100)}%
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-ink)] tracking-tight">
              The tiers
            </h2>
            <p className="text-sm text-[var(--color-ink-2)] mt-1 leading-relaxed">
              Every score maps to a tier, named the way pipelines are: from
              TRUNK (top of the network) down to DRIP.
            </p>
            <div className="flex mt-5 rounded-md overflow-hidden border border-[var(--color-line-2)]">
              {TIERS.map((t) => (
                <div
                  key={t.id}
                  className="flex-1 py-3 px-2 text-center"
                  style={{ backgroundColor: `${t.color}1A` }}
                >
                  <div
                    className="font-mono text-[10px] md:text-xs font-bold uppercase tracking-wider"
                    style={{ color: t.color }}
                  >
                    {t.name}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--color-ink-3)] mt-0.5 tabular-nums">
                    {t.min}–{t.max}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The other boards */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-16 md:mt-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/leaderboard/hardware"
            className="group rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6 hover:border-[var(--color-emerald)] transition-colors"
          >
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-emerald)] font-semibold">
              Hardware board
            </div>
            <div className="text-lg font-bold text-[var(--color-ink)] mt-2 group-hover:text-[var(--color-emerald)] transition-colors">
              Which rig wins?
            </div>
            <p className="text-sm text-[var(--color-ink-2)] mt-1 leading-relaxed">
              Every hardware tag ranked by its best run — Apple Silicon vs
              consumer GPUs vs datacenter cards vs CPU-only.
            </p>
          </Link>
          <Link
            href="/leaderboard/users"
            className="group rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6 hover:border-[var(--color-emerald)] transition-colors"
          >
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-emerald)] font-semibold">
              Users board
            </div>
            <div className="text-lg font-bold text-[var(--color-ink)] mt-2 group-hover:text-[var(--color-emerald)] transition-colors">
              Every run. Every user.
            </div>
            <p className="text-sm text-[var(--color-ink-2)] mt-1 leading-relaxed">
              The community board — sortable, filterable by provider, tier, and
              hardware. Find someone who ran your model on your rig.
            </p>
          </Link>
        </div>
      </section>

      {/* How it works — condensed */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 w-full mt-16 md:mt-20 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          <Step
            n={1}
            title="Point the CLI at your model"
            body="Ollama, LM Studio, MLX, llama.cpp — anything OpenAI-compatible. Local runs need no account and no API key."
          />
          <Step
            n={2}
            title="Tag your hardware"
            body="--hardware-tag m3-max-128gb / rtx-4090-24gb / a100-80gb. Same model on different rigs gets ranked separately — that's the point."
          />
          <Step
            n={3}
            title="Land on the board"
            body="A deterministic 0–100 PipelineScore across 34 tasks, computed on your machine, plus a tier badge and a public spot on the hardware-aware leaderboard."
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-white/50">
      {label}{" "}
      <span className="text-white font-semibold tabular-nums">
        {value.toLocaleString()}
      </span>
    </span>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-xs text-[var(--color-emerald)] tracking-wider font-semibold">
        STEP 0{n}
      </div>
      <h3 className="text-lg font-bold text-[var(--color-ink)]">{title}</h3>
      <p className="text-sm text-[var(--color-ink-2)] leading-relaxed">{body}</p>
    </div>
  );
}
