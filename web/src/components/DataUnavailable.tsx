/**
 * Shown when the API did not answer. The board deliberately renders nothing
 * rather than sample data: every number on this site is supposed to be a real
 * measured run, so an empty honest state beats a populated invented one.
 */
interface Props {
  /** Small caps line above the headline, e.g. "Model board". */
  eyebrow?: string;
  /** What the reader was trying to look at, e.g. "This profile". */
  subject?: string;
  /** Render inline inside a page rather than as a full-height block. */
  inline?: boolean;
}

export function DataUnavailable({
  eyebrow = "Leaderboard",
  subject = "The board",
  inline = false,
}: Props) {
  return (
    <div
      className={`text-center ${
        inline
          ? "border border-[var(--color-line-2)] rounded-lg py-14 px-6"
          : "max-w-3xl mx-auto px-6 md:px-10 py-24"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-emerald)] font-semibold">
        {eyebrow}
      </div>
      <h2 className="display text-2xl md:text-3xl font-bold text-[var(--color-ink)] mt-4">
        {subject} is waking up…
      </h2>
      <p className="text-sm text-[var(--color-ink-2)] mt-3 leading-relaxed max-w-md mx-auto">
        The API is spinning up from a cold start. Refresh in a few seconds. No
        results are shown until real ones load.
      </p>
    </div>
  );
}
