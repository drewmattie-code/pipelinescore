import { getLeaderboardModels } from "@/lib/api";
import { BenchTable } from "@/components/BenchTable";
import { DataUnavailable } from "@/components/DataUnavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Models Leaderboard",
  description:
    "Every model ranked by deterministic PipelineScore — sortable by category, filterable by provider, any two models comparable head-to-head.",
};

export default async function LeaderboardPage() {
  const models = await getLeaderboardModels();
  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
      <div className="max-w-3xl mb-8">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          Live Leaderboard
        </span>
        <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
          {models.length.toLocaleString()} models compared.
        </h1>
        <p className="text-lg text-[var(--color-ink-2)] mt-4 leading-relaxed">
          Best run per model. Click any column to re-rank, filter by provider,
          re-weight for your use case, and pick two rows to go head-to-head.
        </p>
      </div>
      {models.length === 0 ? (
        <DataUnavailable eyebrow="Model board" subject="The board" inline />
      ) : (
        <BenchTable models={models} />
      )}
    </div>
  );
}
