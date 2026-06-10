"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Model } from "@/lib/types";
import {
  CATEGORY_LABELS,
  PROFILES,
  PROFILE_WEIGHTS,
  type ProfileId,
} from "@/lib/tiers";
import { BenchBar } from "./BenchBar";
import { TierBadge } from "./TierBadge";

const CATEGORIES = ["code", "reason", "tool_use", "rag", "speed"] as const;
type SortKey = "composite" | (typeof CATEGORIES)[number] | "samples";

function composite(m: Model, weights: Record<string, number>): number {
  const scores = m.categoryScores as unknown as Record<string, number>;
  let total = 0;
  for (const [cat, w] of Object.entries(weights)) {
    total += w * (scores[cat] ?? 0);
  }
  return Math.round(total * 10) / 10;
}

/**
 * The board. A dense, sortable, searchable benchmark table in the
 * cpu.userbenchmark mold: every metric is a bar, every column header sorts,
 * any two rows can go head-to-head.
 */
export function BenchTable({ models }: { models: Model[] }) {
  const [profile, setProfile] = useState<ProfileId>("balanced");
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [picked, setPicked] = useState<Model[]>([]);

  const providers = useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models]
  );

  const rows = useMemo(() => {
    const weights = PROFILE_WEIGHTS[profile];
    let list = models;
    if (provider) list = list.filter((m) => m.provider === provider);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.displayName.toLowerCase().includes(needle) ||
          m.provider.toLowerCase().includes(needle) ||
          m.family.toLowerCase().includes(needle) ||
          m.slug.toLowerCase().includes(needle)
      );
    }
    const mul = sortDesc ? -1 : 1;
    return [...list].sort((a, b) => {
      const va =
        sortKey === "composite"
          ? composite(a, weights)
          : sortKey === "samples"
          ? a.samples ?? 1
          : a.categoryScores[sortKey];
      const vb =
        sortKey === "composite"
          ? composite(b, weights)
          : sortKey === "samples"
          ? b.samples ?? 1
          : b.categoryScores[sortKey];
      return mul * (va - vb);
    });
  }, [models, profile, sortKey, sortDesc, search, provider]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function togglePick(m: Model) {
    setPicked((cur) => {
      if (cur.some((p) => p.slug === m.slug)) {
        return cur.filter((p) => p.slug !== m.slug);
      }
      // Max two — picking a third swaps out the older selection.
      return cur.length < 2 ? [...cur, m] : [cur[1], m];
    });
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDesc ? "▾" : "▴") : "";

  const headerCls = (key: SortKey) =>
    `cursor-pointer select-none whitespace-nowrap transition-colors hover:text-[var(--color-ink)] ${
      sortKey === key
        ? "text-[var(--color-emerald)] font-bold"
        : "text-[var(--color-ink-3)]"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls row: search + provider filter + profile weighting */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)] text-sm"
            aria-hidden
          >
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            autoComplete="off"
            spellCheck={false}
            className="w-56 pl-9 pr-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-line)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-emerald)] transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="All"
            active={provider === null}
            onClick={() => setProvider(null)}
          />
          {providers.map((p) => (
            <FilterChip
              key={p}
              label={p}
              active={provider === p}
              onClick={() => setProvider(provider === p ? null : p)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-3)] mr-1">
            Weighting
          </span>
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfile(p.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                profile === p.id
                  ? "bg-[var(--color-emerald)] text-white border-[var(--color-emerald)]"
                  : "bg-transparent text-[var(--color-ink-2)] border-[var(--color-line)] hover:border-[var(--color-ink-3)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[11px] font-mono text-[var(--color-ink-3)] tabular-nums">
        {rows.length} model{rows.length === 1 ? "" : "s"} · sorted by{" "}
        {sortKey === "composite"
          ? `${PROFILES.find((p) => p.id === profile)?.label} composite`
          : sortKey === "samples"
          ? "samples"
          : CATEGORY_LABELS[sortKey]}{" "}
        {sortDesc ? "(high → low)" : "(low → high)"} · pick any two rows to
        compare
      </div>

      {/* The board */}
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
                Model
              </th>
              <th
                className={`text-left font-medium py-2.5 px-2 w-[150px] ${headerCls("composite")}`}
                onClick={() => toggleSort("composite")}
              >
                PipelineScore {arrow("composite")}
              </th>
              {CATEGORIES.map((c) => (
                <th
                  key={c}
                  className={`text-left font-medium py-2.5 px-2 w-[124px] hidden lg:table-cell ${headerCls(c)}`}
                  onClick={() => toggleSort(c)}
                >
                  {CATEGORY_LABELS[c]} {arrow(c)}
                </th>
              ))}
              <th
                className={`text-right font-medium py-2.5 px-2 w-16 hidden md:table-cell ${headerCls("samples")}`}
                onClick={() => toggleSort("samples")}
              >
                Runs {arrow("samples")}
              </th>
              <th className="text-center font-medium py-2.5 pl-2 pr-3 w-24 text-[var(--color-ink-3)]">
                Tier
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const isPicked = picked.some((p) => p.slug === m.slug);
              return (
                <tr
                  key={m.slug}
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
                      onChange={() => togglePick(m)}
                      aria-label={`Compare ${m.displayName}`}
                      className="accent-[var(--color-emerald)] w-3.5 h-3.5 align-middle cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/models/${m.slug}`}
                      prefetch={false}
                      className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                    >
                      {m.displayName}
                    </Link>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
                      {m.provider}
                    </span>
                    {m.labVerified && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-emerald)] font-semibold">
                        Lab
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <BenchBar value={composite(m, PROFILE_WEIGHTS[profile])} strong />
                  </td>
                  {CATEGORIES.map((c) => (
                    <td key={c} className="py-2 px-2 hidden lg:table-cell">
                      <BenchBar value={m.categoryScores[c]} />
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right font-mono text-xs text-[var(--color-ink-2)] tabular-nums hidden md:table-cell">
                    {m.samples ?? 1}
                  </td>
                  <td className="py-2 pl-2 pr-3 text-center">
                    <TierBadge tier={m.tier} size="sm" />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-12 text-center text-[var(--color-ink-3)]"
                >
                  No models match{search ? ` "${search}"` : " the current filters"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky head-to-head bar */}
      <div
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-200 ${
          picked.length > 0
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 rounded-full bg-[var(--color-ink)] text-white pl-5 pr-2 py-2 shadow-lg">
          {picked.length === 1 ? (
            <span className="text-sm">
              <span className="font-semibold">{picked[0]?.displayName}</span>
              <span className="text-white/60"> · pick one more to compare</span>
            </span>
          ) : (
            <span className="text-sm font-semibold">
              {picked[0]?.displayName}{" "}
              <span className="text-white/60 font-normal">vs</span>{" "}
              {picked[1]?.displayName}
            </span>
          )}
          {picked.length === 2 && (
            <Link
              href={`/compare/${picked[0].slug}/${picked[1].slug}`}
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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wide transition-colors border ${
        active
          ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]"
          : "bg-transparent text-[var(--color-ink-2)] border-[var(--color-line)] hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
      }`}
    >
      {label}
    </button>
  );
}
