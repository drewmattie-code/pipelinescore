import { MOCK_MODELS } from "@/lib/mockData";
import { LeaderboardTable } from "@/components/LeaderboardTable";

export const metadata = {
  title: "Leaderboard · PipelineScore",
  description: "Full PipelineScore leaderboard — every model ranked by composite score and by category.",
};

export default function LeaderboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-20">
      <div className="max-w-3xl mb-12">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          Live Leaderboard
        </span>
        <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
          Every model ranked.
        </h1>
        <p className="text-lg text-[var(--color-ink-2)] mt-4 leading-relaxed">
          Sorted by composite PipelineScore. Filter by category to see who
          actually wins at code, who can reason, and who&apos;s just fast.
        </p>
      </div>
      <LeaderboardTable models={MOCK_MODELS} />
    </div>
  );
}
