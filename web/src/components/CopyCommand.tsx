"use client";

import { useState } from "react";

/** A one-line shell command in a dark pill with a copy button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (http, old browser) — nothing useful to do.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--color-ink)] text-white pl-4 pr-2 py-2 max-w-full">
      <code className="font-mono text-xs md:text-[13px] whitespace-nowrap overflow-x-auto py-1">
        <span className="text-white/40 select-none">$ </span>
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className={`shrink-0 text-[10px] uppercase tracking-wider font-semibold px-3 py-1.5 rounded-md transition-colors ${
          copied
            ? "bg-[var(--color-emerald)] text-white"
            : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
        }`}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
