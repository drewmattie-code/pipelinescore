import Link from "next/link";
import { getV4Board } from "@/lib/api";
import { V4Table } from "@/components/V4Table";
import { DataUnavailable } from "@/components/DataUnavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "v4 Leaderboard",
  description:
    "PipelineScore v4: 71 tasks across code, repo bug fixes, multi-step agent work, tool calls, reasoning, long documents and instructions. Scored on the machine that ran them.",
};

export default async function V4LeaderboardPage() {
  const rows = await getV4Board();
  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16">
      <div className="max-w-3xl mb-8">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
          PipelineScore v4
        </span>
        <h1 className="display text-4xl md:text-5xl font-semibold mt-3 text-[var(--color-ink)] tracking-tight">
          71 tasks. Real tools. Real repos.
        </h1>
        <p className="text-lg text-[var(--color-ink-2)] mt-4 leading-relaxed">
          v4 tests what a model does with work you would actually hand it: fixing a bug in a real
          repository, finishing a multi-step job by calling tools in the right order, and answering
          from long documents. Code runs in a sandbox and every answer is checked by a program, not
          another model. The score is quality only; run time sits beside it.
        </p>
        <p className="text-sm text-[var(--color-ink-3)] mt-3">
          v4 is harder than v3, so scores are lower and the two boards are not comparable.{" "}
          <Link href="/leaderboard" className="text-[var(--color-emerald)] hover:underline">
            See the v3 board
          </Link>
          .
        </p>
      </div>
      {rows.length === 0 ? (
        <DataUnavailable eyebrow="v4 board" subject="The v4 board" inline />
      ) : (
        <V4Table rows={rows} />
      )}
    </div>
  );
}
