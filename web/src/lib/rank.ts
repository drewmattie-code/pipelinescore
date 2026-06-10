/** "1st", "2nd", "3rd", "11th", "21st" … */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Percentile of rank r in a field of n, where r=1 is best. 1st of 96 → 99. */
export function percentileOfRank(rank: number, total: number): number {
  if (total <= 1) return 100;
  return Math.round(((total - rank) / total) * 100);
}

/** Share (0-100) of values strictly below v. */
export function beatsPct(v: number, all: number[]): number {
  if (all.length === 0) return 0;
  return Math.round((all.filter((x) => x < v).length / all.length) * 100);
}
