"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HardwareBoardRow } from "@/lib/types";
import { BenchBar } from "./BenchBar";
import { TierBadge } from "./TierBadge";

// Server-enriched row: price + normalized score-per-dollar (0-100, best=100).
export interface HardwareTableRow extends HardwareBoardRow {
  price?: number;
  value?: number;
}

type SortKey = "best" | "value" | "runs" | "latency";

// Latency ranks ascending (lower is better); everything else descending.
const DEFAULT_DESC: Record<SortKey, boolean> = {
  best: true,
  value: true,
  runs: true,
  latency: false,
};

export function HardwareTable({ rows }: { rows: HardwareTableRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("best");
  const [sortDesc, setSortDesc] = useState(true);
  const [picked, setPicked] = useState<HardwareTableRow[]>([]);

  const sorted = useMemo(() => {
    const val = (r: HardwareTableRow): number | null => {
      switch (sortKey) {
        case "best":
          return r.bestScore;
        case "value":
          return r.value ?? null;
        case "runs":
          return r.runs;
        case "latency":
          return r.avgLatencyMs;
      }
    };
    const mul = sortDesc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return b.bestScore - a.bestScore;
      if (va === null) return 1; // unpriced / unmeasured rows sink
      if (vb === null) return -1;
      return mul * (va - vb);
    });
  }, [rows, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(DEFAULT_DESC[key]);
    }
  }

  function togglePick(r: HardwareTableRow) {
    setPicked((cur) => {
      if (cur.some((p) => p.tag === r.tag)) return cur.filter((p) => p.tag !== r.tag);
      return cur.length < 2 ? [...cur, r] : [cur[1], r];
    });
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDesc ? "▾" : "▴") : "");
  const headerCls = (key: SortKey) =>
    `cursor-pointer select-none whitespace-nowrap transition-colors hover:text-[var(--color-ink)] ${
      sortKey === key
        ? "text-[var(--color-emerald)] font-bold"
        : "text-[var(--color-ink-3)]"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-mono text-[var(--color-ink-3)] tabular-nums">
        {rows.length} rigs · sorted by{" "}
        {sortKey === "best"
          ? "best score"
          : sortKey === "value"
          ? "value (score per dollar)"
          : sortKey}{" "}
        {sortDesc ? "(high → low)" : "(low → high)"} · pick any two rigs to
        compare
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--color-line)] bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider">
              <th className="text-right font-medium py-2.5 pl-3 pr-1 w-10 text-[var(--color-ink-3)]">
                #
              </th>
              <th className="text-center font-medium py-2.5 px-1 w-9 text-[var(--color-ink-3)]">
                vs
              </th>
              <th className="text-left font-medium py-2.5 px-2 text-[var(--color-ink-3)]">
                Hardware
              </th>
              <th
                className={`text-left font-medium py-2.5 px-2 w-[160px] ${headerCls("best")}`}
                onClick={() => toggleSort("best")}
              >
                Best PipelineScore {arrow("best")}
              </th>
              <th className="text-left font-medium py-2.5 px-2 text-[var(--color-ink-3)]">
                Best model on this rig
              </th>
              <th
                className={`text-left font-medium py-2.5 px-2 w-[130px] hidden md:table-cell ${headerCls("value")}`}
                onClick={() => toggleSort("value")}
              >
                Value {arrow("value")}
              </th>
              <th className="text-right font-medium py-2.5 px-2 w-24 hidden lg:table-cell text-[var(--color-ink-3)]">
                Est. price
              </th>
              <th
                className={`text-right font-medium py-2.5 px-2 w-14 ${headerCls("runs")}`}
                onClick={() => toggleSort("runs")}
              >
                Runs {arrow("runs")}
              </th>
              <th
                className={`text-right font-medium py-2.5 px-2 w-24 hidden xl:table-cell ${headerCls("latency")}`}
                onClick={() => toggleSort("latency")}
              >
                Latency {arrow("latency")}
              </th>
              <th className="text-center font-medium py-2.5 pl-2 pr-3 w-24 text-[var(--color-ink-3)]">
                Tier
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isPicked = picked.some((p) => p.tag === r.tag);
              return (
                <tr
                  key={r.tag}
                  className={`border-b border-[var(--color-line-2)] last:border-b-0 even:bg-[var(--color-surface-2)]/50 hover:bg-[color:var(--color-emerald)]/5 transition-colors ${
                    isPicked ? "bg-[color:var(--color-emerald)]/10" : ""
                  }`}
                >
                  <td className="py-2 pl-3 pr-1 text-right font-mono text-xs text-[var(--color-ink-3)] tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-2 px-1 text-center">
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => togglePick(r)}
                      aria-label={`Compare ${r.tag}`}
                      className="accent-[var(--color-emerald)] w-3.5 h-3.5 align-middle cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/leaderboard/users?hardware=${encodeURIComponent(r.tag)}`}
                      prefetch={false}
                      className="font-mono text-[13px] font-semibold text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                      title={`All runs on ${r.tag}`}
                    >
                      {r.tag}
                    </Link>
                  </td>
                  <td className="py-2 px-2">
                    <BenchBar value={r.bestScore} strong />
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/models/${r.bestModel.slug}`}
                      prefetch={false}
                      className="text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                    >
                      {r.bestModel.displayName}
                    </Link>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                      {r.bestModel.provider}
                    </span>
                  </td>
                  <td className="py-2 px-2 hidden md:table-cell">
                    {r.value !== undefined ? (
                      <BenchBar value={r.value} />
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums hidden lg:table-cell">
                    {r.price !== undefined ? `$${r.price.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums">
                    {r.runs}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums hidden xl:table-cell">
                    {r.avgLatencyMs !== null ? `${r.avgLatencyMs.toLocaleString()}ms` : "—"}
                  </td>
                  <td className="py-2 pl-2 pr-3 text-center">
                    <TierBadge tier={r.bestTier} size="sm" />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-[var(--color-ink-3)]">
                  No hardware-tagged runs yet. Be the first —{" "}
                  <Link href="/run" className="underline hover:text-[var(--color-emerald)]">
                    run the CLI
                  </Link>{" "}
                  with <span className="font-mono">--hardware-tag</span>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky rig head-to-head bar */}
      <div
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${
          picked.length > 0
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 rounded-full bg-[var(--color-ink)] text-white pl-5 pr-2 py-2 shadow-lg">
          {picked.length === 1 ? (
            <span className="text-sm font-mono">
              <span className="font-semibold">{picked[0]?.tag}</span>
              <span className="text-white/60 font-sans"> · pick one more rig</span>
            </span>
          ) : (
            <span className="text-sm font-mono font-semibold">
              {picked[0]?.tag} <span className="text-white/60 font-normal">vs</span>{" "}
              {picked[1]?.tag}
            </span>
          )}
          {picked.length === 2 && (
            <Link
              href={`/compare/hardware/${encodeURIComponent(picked[0].tag)}/${encodeURIComponent(picked[1].tag)}`}
              prefetch={false}
              className="rounded-full bg-[var(--color-emerald)] hover:bg-[var(--color-emerald-dark)] transition-colors px-4 py-1.5 text-sm font-semibold"
            >
              Compare →
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPicked([])}
            aria-label="Clear comparison"
            className="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
