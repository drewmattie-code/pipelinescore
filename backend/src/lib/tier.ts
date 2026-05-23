export function tierForScore(score: number): string {
  if (score >= 90) return 'trunk';
  if (score >= 75) return 'mainline';
  if (score >= 60) return 'feeder';
  if (score >= 40) return 'tap';
  return 'drip';
}
