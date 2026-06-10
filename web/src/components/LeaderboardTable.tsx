"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Model } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/tiers";
import { ScoreNumber } from "./ScoreNumber";
import { TierBadge } from "./TierBadge";
import { CategoryBarsInline } from "./CategoryBars";

type CategoryFilter = "overall" | "code" | "reason" | "write" | "tool_use" | "rag" | "speed";

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "code", label: CATEGORY_LABELS.code },
  { id: "reason", label: CATEGORY_LABELS.reason },
  { id: "write", label: CATEGORY_LABELS.write },
  { id: "tool_use", label: CATEGORY_LABELS.tool_use },
  { id: "rag", label: CATEGORY_LABELS.rag },
  { id: "speed", label: CATEGORY_LABELS.speed },
];

// v2 weighting profiles (mirror benchmarks/taxonomy.json). The "Overall" column
// is a weighted composite of the six category scores; the profile chooses the
// weighting so the ranking reflects a use case instead of one fixed average.
type ProfileId = "balanced" | "coding" | "writing" | "agentic" | "local-first";
const PROFILE_WEIGHTS: Record<ProfileId, Record<string, number>> = {
  balanced: { code: 0.25, reason: 0.2, write: 0.15, tool_use: 0.15, rag: 0.12, speed: 0.13 },
  coding: { code: 0.4, reason: 0.18, write: 0.05, tool_use: 0.2, rag: 0.07, speed: 0.1 },
  writing: { code: 0.05, reason: 0.2, write: 0.45, tool_use: 0.05, rag: 0.15, speed: 0.1 },
  agentic: { code: 0.22, reason: 0.22, write: 0.06, tool_use: 0.3, rag: 0.12, speed: 0.08 },
  "local-first": { code: 0.22, reason: 0.18, write: 0.12, tool_use: 0.13, rag: 0.1, speed: 0.25 },
};
const PROFILES: { id: ProfileId; label: string }[] = [
  { id: "balanced", label: "Balanced" },
  { id: "coding", label: "Coding" },
  { id: "writing", label: "Writing" },
  { id: "agentic", label: "Agentic" },
  { id: "local-first", label: "Local-first" },
];

function composite(m: Model, weights: Record<string, number>): number {
  const scores = m.categoryScores as unknown as Record<string, number>;
  let total = 0;
  for (const [cat, w] of Object.entries(weights)) {
    total += w * (scores[cat] ?? 0);
  }
  return Math.round(total * 10) / 10;
}

export function LeaderboardTable({ models }: { models: Model[] }) {
  const [filter, setFilter] = useState<CategoryFilter>("overall");
  const [profile, setProfile] = useState<ProfileId>("balanced");

  const sorted = useMemo(() => {
    if (filter === "overall") {
      const w = PROFILE_WEIGHTS[profile];
      return [...models].sort((a, b) => composite(b, w) - composite(a, w));
    }
    return [...models].sort((a, b) => b.categoryScores[filter] - a.categoryScores[filter]);
  }, [models, filter, profile]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] mr-2">
          View
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              filter === f.id
                ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]"
                : "bg-transparent text-[var(--color-ink-2)] border-[var(--color-line)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === "overall" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] mr-2">
            Weighting
          </span>
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfile(p.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                profile === p.id
                  ? "bg-[var(--color-emerald)] text-white border-[var(--color-emerald)]"
                  : "bg-transparent text-[var(--color-ink-2)] border-[var(--color-line)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto -mx-6 md:mx-0">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-[var(--color-line-2)] text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">
              <th className="text-left font-medium py-3 pl-6 md:pl-4 w-10">#</th>
              <th className="text-left font-medium py-3">Model</th>
              <th className="text-left font-medium py-3 hidden md:table-cell">Provider</th>
              <th className="text-right font-medium py-3">
                {filter === "overall"
                  ? `PipelineScore (${PROFILES.find((p) => p.id === profile)?.label})`
                  : CATEGORY_LABELS[filter]}
              </th>
              <th className="text-center font-medium py-3">Tier</th>
              <th className="text-left font-medium py-3 pl-6 hidden lg:table-cell">
                Category mix
              </th>
              <th className="py-3 pr-6 md:pr-4" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => {
              const display =
                filter === "overall"
                  ? composite(m, PROFILE_WEIGHTS[profile])
                  : m.categoryScores[filter];
              return (
                <tr
                  key={m.slug}
                  className="border-b border-[var(--color-line-2)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <td className="py-4 pl-6 md:pl-4 font-mono text-sm text-[var(--color-ink-3)] tabular-nums">
                    {i + 1}
                  </td>
                  <td className="py-4">
                    <Link
                      href={`/models/${m.slug}`}
                      prefetch={false}
                      className="font-medium text-[var(--color-ink)] hover:text-[var(--color-emerald)] transition-colors"
                    >
                      {m.displayName}
                    </Link>
                    {m.labVerified && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-emerald)] font-semibold">
                        Lab
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-sm text-[var(--color-ink-2)] hidden md:table-cell">
                    {m.provider}
                  </td>
                  <td className="py-4 text-right">
                    <ScoreNumber score={display} size="md" />
                  </td>
                  <td className="py-4 text-center">
                    <TierBadge tier={m.tier} size="sm" />
                  </td>
                  <td className="py-4 pl-6 hidden lg:table-cell">
                    <CategoryBarsInline scores={m.categoryScores} />
                  </td>
                  <td className="py-4 pr-6 md:pr-4 text-right">
                    <Link
                      href={`/models/${m.slug}`}
                      prefetch={false}
                      className="text-xs text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
                    >
                      Detail →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
