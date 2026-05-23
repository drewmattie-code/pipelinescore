"use client";

import { useState } from "react";

const PASTE_PROMPT = `Help me run a PipelineScore benchmark.

PipelineScore is a 25-task standardized LLM benchmark with a public leaderboard at pipelinescore.ai. I want to run it and submit my result.

Please do the following:

1. Ask me which provider to use (anthropic, openai, or local).
2. Ask me which model id to benchmark (e.g. claude-opus-4-7, gpt-5.5-2026-04, qwen3.6-27b).
3. Ask me for a leaderboard nickname (alphanum + . _ -, 2-40 chars). If I've never set one, this becomes my public identity on the board.
4. Ask if I'm testing a customized variant (system prompt, LoRA adapter, persona, RAG setup). If yes, ask for a short config_tag (e.g. "lora-domain-finance", "system-prompt-coder", "temp-zero"). If it's a vanilla run, skip this.
5. Confirm I have the relevant API key in my environment (ANTHROPIC_API_KEY or OPENAI_API_KEY).
6. Run this command in my shell:

   npx @pipelinescore/cli run \\
     --provider <provider> \\
     --model <model-id> \\
     --user <nickname> \\
     --config-tag <tag-if-any>

   For provider=local, also include --endpoint <openai-compatible-url>.

7. Show me the score card output verbatim — don't paraphrase the numbers. The output includes my tier (TRUNK/MAINLINE/FEEDER/TAP/DRIP), composite PipelineScore, per-category breakdown, and a share URL.

8. Offer to compare against another model with a follow-up run, OR show me how a different --config-tag changes the score for the same base model.

Notes:
- The CLI is open source and runs locally; my API key never leaves my machine
- The public leaderboard is at pipelinescore.ai/leaderboard/users
- My profile after I run will be at pipelinescore.ai/users/<nickname>
- Submissions are rate-limited: 20/IP/hour, 100/nickname/day, 5/(nickname,model)/hour — don't retry on 429, just wait

Start with question 1.`;

export function PasteToAI() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(PASTE_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers — select the textarea instead
      const ta = document.getElementById("paste-prompt-text") as HTMLTextAreaElement | null;
      if (ta) {
        ta.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--color-line-2)] bg-[var(--color-surface)] p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-ink)] tracking-tight">
            Don&apos;t have the CLI? Paste this into any AI.
          </h3>
          <p className="text-sm text-[var(--color-ink-2)] mt-1 leading-relaxed">
            Works with Claude, ChatGPT, Cursor, Codex, Gemini — anything that can
            run a shell command. The AI walks you through the benchmark.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className={`shrink-0 text-xs uppercase tracking-wider font-semibold px-4 py-2 rounded-full transition-colors ${
            copied
              ? "bg-[var(--color-emerald)] text-white"
              : "border border-[var(--color-line)] text-[var(--color-ink)] hover:border-[var(--color-emerald)] hover:text-[var(--color-emerald)]"
          }`}
        >
          {copied ? "Copied ✓" : "Copy prompt"}
        </button>
      </div>

      <textarea
        id="paste-prompt-text"
        readOnly
        value={PASTE_PROMPT}
        className="w-full h-64 font-mono text-xs bg-[color:var(--color-ink)] text-[color:var(--color-bg)] rounded-xl p-4 leading-relaxed resize-none focus:outline-none"
      />

      <div className="mt-4 text-xs text-[var(--color-ink-3)] leading-relaxed">
        Tested with: Claude Code, ChatGPT (GPT-5.5), Cursor, Gemini Pro, Codex.
        Your AI will ask for your provider, model, nickname, and optional config
        tag — then run the CLI for you. Takes ~3 minutes including API time.
      </div>
    </div>
  );
}
