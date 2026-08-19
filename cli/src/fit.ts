/**
 * `pipelinescore fit` — what can this machine actually run?
 *
 * Why this command exists: PipelineScore's benchmark answers "how good is the model
 * I already have running", which is a question you can only ask AFTER installing a
 * local inference stack and pulling weights. `fit` answers the question that comes
 * first — "what could I run at all" — in about a second, with nothing installed.
 *
 * What makes it different from a pure estimator: where the leaderboard holds a REAL
 * measured run on hardware like yours, we show that score instead of a guess. That
 * is the one thing an estimate-only tool can never do.
 *
 * Honesty rules baked in, because this is the product's whole asset:
 *  - Fit is an ESTIMATE and is labelled as one, every time.
 *  - A measured score is only shown when a real run exists. If the backend is
 *    unreachable or has nothing for this rig, we say so. We never fill the gap.
 *  - Seeded rows can't leak in: the board was purged, and we additionally ignore
 *    anything submitted by the pre-release CLI.
 */
import { CATALOG, type CatalogModel } from './catalog.js';
import { detectHardware, estimateModelMemoryGb, type HardwareInfo } from './hardware.js';

export type Verdict = 'comfortable' | 'tight' | 'no';

export interface FitRow {
  model: CatalogModel;
  quant: string;
  estGb: number;
  verdict: Verdict;
  headroomGb: number;
  alsoFits?: string[];
  /** True when this row came from real leaderboard data rather than the static catalog. */
  fromBoard?: boolean;
  measured?: { score: number; runs: number; hardwareTag: string };
}

/** Usable memory for weights + KV cache.
 *
 * Discrete GPU: VRAM, minus a slice for the display and driver.
 * Unified memory (Apple Silicon): the OS and everything else need a real share —
 * macOS will not let a process map all of it, and a machine that swaps is a machine
 * that is not really running the model.
 */
export function usableBudgetGb(hw: HardwareInfo): { gb: number; kind: 'vram' | 'ram' } {
  if (hw.vramGb != null) return { gb: Math.max(1, hw.vramGb - 1), kind: 'vram' };
  return { gb: Math.max(1, Math.round(hw.totalRamGb * 0.72)), kind: 'ram' };
}

const QUANTS = ['q4', 'q8', 'fp16'] as const;

/** Reference quantisation.
 *
 * q4 is the baseline on purpose: it is what Ollama, LM Studio and llama.cpp
 * actually serve by default, so it is the honest answer to "can I run this".
 * Reporting the highest fidelity that happens to fit made small models look
 * enormous — a 3B showing as 7GB fp16 rather than the 2GB q4 anyone would run.
 * `alsoFits` notes the headroom for people who care.
 */
export function bestQuantFor(model: CatalogModel, budgetGb: number): { quant: string; estGb: number; alsoFits: string[] } {
  const est = estimateModelMemoryGb(`${model.params}b`, 'q4') ?? 0;
  const alsoFits: string[] = [];
  for (const q of ['q8', 'fp16']) {
    const e = estimateModelMemoryGb(`${model.params}b`, q);
    if (e != null && e <= budgetGb) alsoFits.push(q);
  }
  return { quant: 'q4', estGb: est, alsoFits };
}

export function fitAll(hw: HardwareInfo): FitRow[] {
  const { gb: budget } = usableBudgetGb(hw);
  return CATALOG.map((model) => {
    const { quant, estGb, alsoFits } = bestQuantFor(model, budget);
    const headroomGb = Math.round((budget - estGb) * 10) / 10;
    let verdict: Verdict;
    if (estGb <= budget * 0.75) verdict = 'comfortable';
    else if (estGb <= budget) verdict = 'tight';
    else verdict = 'no';
    return { model, quant, estGb, verdict, headroomGb, alsoFits };
  });
}

interface BoardRow {
  pipeline_score: number;
  hardware_tag: string | null;
  cli_version?: string | null;
  model?: { slug?: string; display_name?: string };
}

/**
 * Real measured scores for this hardware tag. Best-effort and non-fatal: `fit`
 * must work with no network at all, so any failure returns an empty map and the
 * caller simply shows no measured column.
 */
export async function measuredFor(
  hardwareTag: string | null,
  backend: string,
  timeoutMs = 4000
): Promise<{ scores: Map<string, { score: number; runs: number; name: string }>; reachable: boolean }> {
  const out = new Map<string, { score: number; runs: number; name: string }>();
  if (!hardwareTag) return { scores: out, reachable: false };
  let reachable = false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${backend}/v1/leaderboard/users?hardware=${encodeURIComponent(hardwareTag)}&limit=200`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { scores: out, reachable: false };
    reachable = true;
    const data = (await res.json()) as { entries?: BoardRow[] };
    for (const r of data.entries ?? []) {
      // Belt and braces: the synthetic rows were purged from the board, but never
      // let a pre-release submission stand in for a real measurement.
      if (r.cli_version === '0.1.0') continue;
      const slug = r.model?.slug;
      if (!slug || typeof r.pipeline_score !== 'number') continue;
      const name = r.model?.display_name || slug;
      const cur = out.get(slug);
      // Keep the best score per model, and count how many real runs back it.
      if (!cur) out.set(slug, { score: r.pipeline_score, runs: 1, name });
      else out.set(slug, { score: Math.max(cur.score, r.pipeline_score), runs: cur.runs + 1, name });
    }
  } catch {
    /* offline, slow, or unreachable — fit still works, just without measured data */
  } finally {
    clearTimeout(t);
  }
  // `reachable` matters: "the board has nothing for this rig" and "we could not
  // ask the board" are different facts, and telling a user the first when the
  // second is true is exactly the kind of confident wrongness this product exists
  // to avoid.
  return { scores: out, reachable };
}

export { detectHardware };


/**
 * Models with real measured runs on this rig that aren't in the static catalog.
 *
 * The board tracks more models than the seed list (people benchmark whatever they
 * have), and those are precisely the rows worth showing: someone ran this exact
 * model on this exact hardware. We estimate fit where the id carries a parameter
 * count, and simply omit the estimate where it doesn't — rather than guess.
 */
export function boardOnlyRows(
  measured: Map<string, { score: number; runs: number; name: string }>,
  hw: HardwareInfo,
  catalogSlugs: Set<string>
): FitRow[] {
  const { gb: budget } = usableBudgetGb(hw);
  const rows: FitRow[] = [];
  for (const [slug, m] of measured) {
    if (catalogSlugs.has(slug)) continue;
    const est = estimateModelMemoryGb(slug, 'q4');
    const params = est != null ? Math.round((est / 0.66) * 10) / 10 : 0;
    rows.push({
      model: { id: slug, name: m.name, slug, family: 'measured', params, ctx: 0 },
      quant: 'q4',
      estGb: est ?? 0,
      verdict: est == null ? 'comfortable' : est <= budget * 0.75 ? 'comfortable' : est <= budget ? 'tight' : 'no',
      headroomGb: est != null ? Math.round((budget - est) * 10) / 10 : 0,
      fromBoard: true,
      measured: { score: m.score, runs: m.runs, hardwareTag: hw.tag! },
    });
  }
  return rows;
}
