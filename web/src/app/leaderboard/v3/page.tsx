import Link from "next/link";
import { getLeaderboardModels } from "@/lib/api";
import { BenchTable } from "@/components/BenchTable";
import { DataUnavailable } from "@/components/DataUnavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "v3 Leaderboard (archive)",
  description:
    "Every model ranked by deterministic PipelineScore — sortable by category, filterable by provider, any two models comparable head-to-head.",
};

export default async function V3LeaderboardPage() {
  const models = await getLeaderboardModels();
  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
      <div className="max-w-3xl mb-8">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          PipelineScore v3 · archive
        </span>
        <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
          {models.length.toLocaleString()} models compared.
        </h1>
        <p className="text-lg text-[var(--color-ink-2)] mt-4 leading-relaxed">
          Best run per model. Click any column to re-rank, filter by provider,
          re-weight for your use case, and pick two rows to go head-to-head.
        </p>
        <p className="text-sm text-[var(--color-ink-3)] mt-3">
          This is the 34-task v3 board, kept as an archive. The current test is v4.{" "}
          <Link href="/leaderboard" className="text-[var(--color-emerald)] hover:underline">
            See the v4 board
          </Link>
          .
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
