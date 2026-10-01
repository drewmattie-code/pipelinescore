"use client";

import { useMemo, useState } from "react";
import type { V4Row } from "@/lib/api";
import { V4_SUITES, V4_SUITE_LABELS, type V4Suite } from "@/lib/tiers";
import { BenchBar } from "./BenchBar";

type SortKey = "score" | V4Suite | "time";

function fmtTime(s: number | null): string {
  if (s == null) return "–";
  if (s < 90) return `${Math.round(s)}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

/**
 * The v4 board. One row per model and hardware, because v4 ranks where a model runs as
 * well as which model it is. The score is quality only; run time sits beside it.
 */
export function V4Table({ rows }: { rows: V4Row[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    let list = rows;
    const needle = search.trim().toLowerCase();
    if (needle) {
      list = list.filter((r) =>
        [r.displayName, r.provider, r.hardware ?? "", r.userNickname ?? ""].some((v) => v.toLowerCase().includes(needle)),
      );
    }
    const val = (r: V4Row): number =>
      sortKey === "score" ? r.score : sortKey === "time" ? -(r.wallSeconds ?? Infinity) : (r.suites[sortKey] ?? -1);
    const mul = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => mul * (val(a) - val(b)));
  }, [rows, sortKey, sortDesc, search]);

  function toggle(k: SortKey) {
    if (sortKey === k) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortDesc ? "▾" : "▴") : "");
  const head = (k: SortKey) =>
    `cursor-pointer select-none whitespace-nowrap transition-colors hover:text-[var(--color-ink)] ${
      sortKey === k ? "text-[var(--color-emerald)] font-bold" : "text-[var(--color-ink-3)]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] text-sm" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models, hardware…"
            aria-label="Search the v4 board"
            autoComplete="off"
            spellCheck={false}
            className="w-64 pl-9 pr-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-emerald)] transition-colors"
          />
        </div>
        <span className="text-[11px] font-mono text-[var(--color-ink-3)] tabular-nums">
          {sorted.length} run{sorted.length === 1 ? "" : "s"} · best run per model and hardware · click a column to re-rank
        </span>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider">
              <th className="text-right font-medium py-2.5 pl-3 pr-1 w-10 text-[var(--color-ink-3)]">#</th>
              <th className="text-left font-medium py-2.5 px-2 text-[var(--color-ink-3)]">Model · hardware</th>
              <th className={`text-left font-medium py-2.5 px-2 w-[150px] ${head("score")}`} onClick={() => toggle("score")}>
                PipelineScore {arrow("score")}
              </th>
              {V4_SUITES.map((s) => (
                <th key={s} className={`text-left font-medium py-2.5 px-2 w-[112px] hidden lg:table-cell ${head(s)}`} onClick={() => toggle(s)}>
                  {V4_SUITE_LABELS[s]} {arrow(s)}
                </th>
              ))}
              <th className={`text-right font-medium py-2.5 pl-2 pr-3 w-20 ${head("time")}`} onClick={() => toggle("time")}>
                Run time {arrow("time")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={`${r.slug}@${r.hardware}`}
                className="border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors"
              >
                <td className="py-2 pl-3 pr-1 text-right font-mono text-xs text-[var(--color-ink-3)] tabular-nums">{i + 1}</td>
                <td className="py-2 px-2">
                  <a href={`/s/${r.submissionId}`} className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors">
                    {r.displayName}
                  </a>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                    {r.hardware === "cloud" || !r.hardware ? r.provider : r.hardware}
                  </span>
                  {r.runs > 1 && <span className="ml-2 text-[10px] text-[var(--color-ink-3)]">{r.runs} runs</span>}
                </td>
                <td className="py-2 px-2">
                  <BenchBar value={r.score} strong />
                </td>
                {V4_SUITES.map((s) => (
                  <td key={s} className="py-2 px-2 hidden lg:table-cell">
                    {r.suites[s] == null ? <span className="text-[var(--color-ink-3)]">–</span> : <BenchBar value={r.suites[s] as number} />}
                  </td>
                ))}
                <td className="py-2 pl-2 pr-3 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums">{fmtTime(r.wallSeconds)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-[var(--color-ink-3)]">
                  {search ? `No runs match "${search}".` : "No v4 runs yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
