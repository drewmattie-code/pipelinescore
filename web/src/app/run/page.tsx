import Link from "next/link";
import { PasteToAI } from "@/components/PasteToAI";

export const metadata = {
  title: "Run a benchmark",
  description:
    "One npx command, your own API key, a deterministic PipelineScore in under five minutes.",
};

const LOCAL_ENDPOINTS = [
  { id: "ollama", port: "11434", label: "Ollama" },
  { id: "lm-studio", port: "1234", label: "LM Studio" },
  { id: "llama-cpp", port: "8080", label: "llama.cpp server" },
  { id: "mlx-omni", port: "10240", label: "MLX-Omni / mlx_lm" },
  { id: "litellm", port: "8000", label: "LiteLLM proxy" },
];

const FRONTIER_PROVIDERS = [
  { id: "anthropic", model: "claude-opus-4-7", label: "Anthropic" },
  { id: "openai", model: "gpt-5-5", label: "OpenAI" },
  { id: "google", model: "gemini-2-5-pro", label: "Google (via openai-compat proxy)" },
  { id: "mistral", model: "mistral-large-2", label: "Mistral (via openai-compat)" },
];

export default function RunPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-20">
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        Get started
      </span>
      <h1 className="display text-4xl md:text-5xl font-bold tracking-tight text-[var(--color-ink)] mt-3">
        Run on your hardware.
      </h1>
      <div className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--color-emerald)] font-semibold bg-[color:var(--color-emerald)]/10 px-3 py-1.5 rounded-full">
        <span aria-hidden>★</span>
        First 50 submitters get a permanent <BetaBadgeInline /> badge next to their nickname.
      </div>
      <p className="text-lg text-[var(--color-ink)] mt-5 leading-relaxed">
        Three minutes. No account. Point the CLI at your local model server —
        Ollama, LM Studio, MLX, llama.cpp — and tag your hardware. The CLI
        runs 25 standardized tasks, submits the result with your hardware tag,
        and your run lands on the public leaderboard alongside others
        running the same model on different rigs.
      </p>

      <div className="mt-10 rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-ink)] text-white p-6 md:p-7 font-mono text-sm md:text-base overflow-x-auto shadow-sm">
        <span className="text-[var(--color-ink-3)] select-none">$ </span>
        <span className="text-white">npx @pipelinescore/cli run \</span>
        <br />
        <span className="text-white">    </span>
        <span className="text-[var(--color-emerald-light)]">--provider local</span>{" "}
        <span className="text-[var(--color-emerald-light)]">--endpoint http://localhost:11434</span> \
        <br />
        <span className="text-white">    </span>
        <span className="text-[var(--color-emerald-light)]">--model llama-3.3-70b</span>{" "}
        <span className="text-[var(--color-emerald-light)]">--hardware-tag m3-max-128gb</span> \
        <br />
        <span className="text-white">    </span>
        <span className="text-[var(--color-emerald-light)]">--user your-handle</span>
      </div>

      <p className="text-sm text-[var(--color-ink)] mt-3">
        Default Ollama endpoint above. Swap port for LM Studio (1234), llama.cpp (8080), MLX-Omni (10240), or any OpenAI-compatible server.
      </p>

      {/* Cloud-or-local side-by-side */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border-2 border-[var(--color-emerald)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-[var(--color-emerald)] font-bold">
              Local — recommended
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-emerald)] font-semibold bg-[color:var(--color-emerald)]/10 px-2 py-0.5 rounded-full">
              free
            </span>
          </div>
          <h3 className="text-lg font-bold text-[var(--color-ink)]">Run on your machine</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-ink)] leading-relaxed">
            <li>✓ No API key, no provider account</li>
            <li>✓ Zero inference cost</li>
            <li>✓ Compare hardware (M3 Max vs RTX 4090 vs CPU-only)</li>
            <li>✓ Reproducible — your tokens, your weights</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] font-bold">
              Cloud API
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold bg-[color:var(--color-line-2)] px-2 py-0.5 rounded-full">
              ~$1-50/run
            </span>
          </div>
          <h3 className="text-lg font-bold text-[var(--color-ink)]">Bring your own key</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--color-ink)] leading-relaxed">
            <li>• Anthropic / OpenAI / OpenAI-compatible</li>
            <li>• Your key, your machine, never sent to us (<Link href="/privacy" className="underline hover:text-[var(--color-emerald)]">how</Link>)</li>
            <li>• Set a spending cap at the provider first</li>
            <li>• Hardware tag = <span className="font-mono text-[var(--color-emerald)]">cloud-api</span></li>
          </ul>
          <pre className="mt-4 rounded-lg bg-[var(--color-ink)] text-white text-xs p-3 overflow-x-auto font-mono">
{`npx @pipelinescore/cli run \\
  --provider anthropic \\
  --model claude-opus-4-7 \\
  --user your-handle`}
          </pre>
        </div>
      </section>

      <div className="mt-12">
        <PasteToAI />
      </div>

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Power user? Install the skill or MCP.
        </h2>
        <p className="text-sm text-[var(--color-ink)] mt-2 mb-6 leading-relaxed">
          If you live in Claude Code, Codex, OpenCode, OpenClaw, Cursor, or any
          MCP-compatible client, you can install PipelineScore as a tool. Your
          AI will run benchmarks for you without you ever leaving the editor.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6">
            <div className="text-xs uppercase tracking-wider text-[var(--color-emerald)] font-semibold mb-2">
              Skill
            </div>
            <h3 className="text-lg font-bold text-[var(--color-ink)]">Drop-in markdown</h3>
            <p className="text-sm text-[var(--color-ink)] mt-2 leading-relaxed">
              Single <code className="font-mono text-[var(--color-emerald)]">SKILL.md</code> file
              that any AI reads at session start. Works in Claude Code, Codex,
              OpenCode, OpenClaw, Cursor.
            </p>
            <pre className="mt-4 rounded-xl bg-[var(--color-ink)] text-white text-xs p-3 overflow-x-auto font-mono">
{`mkdir -p ~/.claude/skills/pipelinescore
curl -L https://pipelinescore.ai/skills/\\
  pipelinescore/SKILL.md \\
  -o ~/.claude/skills/pipelinescore/SKILL.md`}
            </pre>
          </div>
          <div className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6">
            <div className="text-xs uppercase tracking-wider text-[var(--color-emerald)] font-semibold mb-2">
              MCP server
            </div>
            <h3 className="text-lg font-bold text-[var(--color-ink)]">Three structured tools</h3>
            <p className="text-sm text-[var(--color-ink)] mt-2 leading-relaxed">
              <code className="font-mono text-[var(--color-emerald)]">run_benchmark</code>,{" "}
              <code className="font-mono text-[var(--color-emerald)]">get_user_leaderboard</code>,{" "}
              <code className="font-mono text-[var(--color-emerald)]">get_user_profile</code>.
              Stdio transport, npm-installed.
            </p>
            <pre className="mt-4 rounded-xl bg-[var(--color-ink)] text-white text-xs p-3 overflow-x-auto font-mono">
{`// ~/.claude/settings.json
{
  "mcpServers": {
    "pipelinescore": {
      "command": "npx",
      "args": ["@pipelinescore/mcp"]
    }
  }
}`}
            </pre>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Local servers we&apos;ve tested
        </h2>
        <p className="text-sm text-[var(--color-ink)] mt-2 mb-6">
          Anything with an OpenAI-compatible <code className="font-mono text-[var(--color-emerald)]">/v1/chat/completions</code> endpoint works. These five are the most common:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {LOCAL_ENDPOINTS.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-5 font-mono text-sm flex flex-col gap-2"
            >
              <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] not-italic font-sans">
                {e.label}
              </span>
              <span className="text-[var(--color-ink)]">
                --endpoint <span className="text-[var(--color-emerald)]">http://localhost:{e.port}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Frontier providers (cloud)
        </h2>
        <p className="text-sm text-[var(--color-ink)] mt-2 mb-6">
          For when you want to benchmark the labs&apos; flagships. Bring your own key.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FRONTIER_PROVIDERS.map((p) => (
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
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-ink)] mb-8">
          What happens when you run it
        </h2>
        <ol className="flex flex-col gap-6">
          <Step n={1} title="Fetch today's signed test pack">
            The CLI pulls the rotating 25-task pack from{" "}
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

function BetaBadgeInline() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-emerald)] text-white font-semibold tracking-wider uppercase text-[10px] px-2 py-0.5">
      <span aria-hidden>★</span>
      Beta #1-50
    </span>
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
