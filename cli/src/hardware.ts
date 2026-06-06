/**
 * Native hardware detection for the PipelineScore CLI.
 *
 * The leaderboard ranks where a model runs, so a consistent hardware tag is
 * the whole point of a local submission. Rather than make users type
 * `--hardware-tag` by hand (inconsistent across submissions) or install a
 * separate binary, we detect the machine natively: chip / GPU plus RAM, and
 * normalize it into a stable slug.
 *
 * For deep, accurate model-fit scoring (quality / speed / fit across hundreds
 * of models), see llmfit: https://github.com/AlexsJones/llmfit
 *
 * Detection is best-effort and never throws. On anything unexpected it returns
 * null and the CLI falls back to the existing manual / unspecified behavior.
 */
import { execSync } from 'node:child_process';
import os from 'node:os';

const HARDWARE_TAG_RE = /^[a-zA-Z0-9._-]{2,60}$/;
const COMMON_RAM_GB = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];

const VENDOR_NOISE = /\b(apple|intel|amd|nvidia|geforce|radeon|corporation|core|cpu|processor)\b|\(r\)|\(tm\)|\d+-core/gi;

/** Lowercase, strip non-alphanumerics to single hyphens, trim hyphens. */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** "Apple M3 Max" -> "m3-max"; "AMD Ryzen 9 7950X" -> "ryzen-9-7950x". */
export function normalizeChipName(raw: string): string {
  return slug(raw.replace(VENDOR_NOISE, '').replace(/@.*$/, ''));
}

/** "NVIDIA GeForce RTX 4090" -> "rtx-4090". */
export function normalizeGpuName(raw: string): string {
  return slug(raw.replace(VENDOR_NOISE, ''));
}

/** Total RAM in bytes -> nearest common GB size (snaps within 15% to avoid "127gb"). */
export function roundRamGb(bytes: number): number {
  const gb = bytes / 1024 ** 3;
  let best = Math.round(gb);
  let bestDiff = Infinity;
  for (const c of COMMON_RAM_GB) {
    const d = Math.abs(c - gb);
    if (d / c <= 0.15 && d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best;
}

/** Parse a parameter count in billions from a model id ("llama-3.3-70b" -> 70). */
export function parseParamCount(modelId: string): number | null {
  const m = modelId.toLowerCase().match(/(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*b(?:[^a-z]|$)/);
  return m ? parseFloat(m[1]) : null;
}

const BYTES_PER_PARAM: Record<string, number> = {
  q4: 0.55, q5: 0.7, q6: 0.85, q8: 1.1, fp16: 2.0, f16: 2.0, bf16: 2.0,
};

function detectQuantFromId(modelId: string): string | null {
  const m = modelId.toLowerCase().match(/q(?:4|5|6|8)|fp16|bf16|f16/);
  return m ? m[0] : null;
}

/** Rough memory estimate (GB) for a model, ~20% overhead for context/KV cache. */
export function estimateModelMemoryGb(modelId: string, quantHint?: string): number | null {
  const params = parseParamCount(modelId);
  if (params == null) return null;
  const q = (quantHint ?? detectQuantFromId(modelId) ?? 'q4').toLowerCase();
  const bpp = BYTES_PER_PARAM[q] ?? BYTES_PER_PARAM.q4;
  return Math.round(params * bpp * 1.2);
}

function sh(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function clampTag(tag: string): string | null {
  const t = tag.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return HARDWARE_TAG_RE.test(t) ? t : null;
}

export interface HardwareInfo {
  /** Normalized hardware tag, or null if detection failed. */
  tag: string | null;
  /** Total system RAM in GB. */
  totalRamGb: number;
  /** Dedicated GPU VRAM in GB, if a discrete GPU was detected (null on unified-memory / unknown). */
  vramGb: number | null;
}

function detectDarwin(ram: number): { tag: string | null; vramGb: number | null } {
  const chip = sh('sysctl -n machdep.cpu.brand_string'); // "Apple M3 Max" or "Intel..."
  if (chip && /apple/i.test(chip)) {
    // Apple Silicon: unified memory, the chip is the compute unit.
    return { tag: clampTag(`${normalizeChipName(chip)}-${ram}gb`), vramGb: null };
  }
  // Intel Mac: prefer a discrete GPU name if present.
  const disp = sh('system_profiler SPDisplaysDataType');
  const gpu = disp?.match(/Chipset Model:\s*(.+)/)?.[1]?.trim();
  if (gpu && !/apple|intel/i.test(gpu)) return { tag: clampTag(`${normalizeGpuName(gpu)}-${ram}gb`), vramGb: null };
  if (chip) return { tag: clampTag(`${normalizeChipName(chip)}-cpu-${ram}gb`), vramGb: null };
  return { tag: null, vramGb: null };
}

function detectLinux(ram: number): { tag: string | null; vramGb: number | null } {
  const nv = sh('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
  if (nv) {
    const [name, mib] = nv.split('\n')[0].split(',').map((s) => s.trim());
    if (name) {
      const vramGb = mib ? Math.round(Number(mib) / 1024) : null;
      const tag = clampTag(vramGb ? `${normalizeGpuName(name)}-${vramGb}gb` : normalizeGpuName(name));
      return { tag, vramGb };
    }
  }
  const cpu = os.cpus()?.[0]?.model;
  if (cpu) return { tag: clampTag(`${normalizeChipName(cpu)}-cpu-${ram}gb`), vramGb: null };
  return { tag: null, vramGb: null };
}

function detectWindows(ram: number): { tag: string | null; vramGb: number | null } {
  const nv = sh('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
  if (nv) {
    const [name, mib] = nv.split('\n')[0].split(',').map((s) => s.trim());
    if (name) {
      const vramGb = mib ? Math.round(Number(mib) / 1024) : null;
      return { tag: clampTag(vramGb ? `${normalizeGpuName(name)}-${vramGb}gb` : normalizeGpuName(name)), vramGb };
    }
  }
  const cpu = os.cpus()?.[0]?.model;
  if (cpu) return { tag: clampTag(`${normalizeChipName(cpu)}-cpu-${ram}gb`), vramGb: null };
  return { tag: null, vramGb: null };
}

/** Detect this machine's hardware. Best-effort; never throws. */
export function detectHardware(): HardwareInfo {
  const totalRamGb = roundRamGb(os.totalmem());
  try {
    let r: { tag: string | null; vramGb: number | null };
    switch (process.platform) {
      case 'darwin': r = detectDarwin(totalRamGb); break;
      case 'linux': r = detectLinux(totalRamGb); break;
      case 'win32': r = detectWindows(totalRamGb); break;
      default: r = { tag: null, vramGb: null };
    }
    return { tag: r.tag, totalRamGb, vramGb: r.vramGb };
  } catch {
    return { tag: null, totalRamGb, vramGb: null };
  }
}

/** Convenience: just the tag. */
export function detectHardwareTag(): string | null {
  return detectHardware().tag;
}

export interface FitCheck {
  modelParamsB: number;
  estRequiredGb: number;
  /** The memory budget we checked against (VRAM if a discrete GPU was found, else system RAM). */
  budgetGb: number;
  budgetKind: 'vram' | 'ram';
  fits: boolean;
}

/**
 * Lightweight "will this model fit" estimate. Returns null when the model id
 * carries no parameter count (e.g. a frontier API model). This is a heuristic,
 * not llmfit's accurate scorer.
 */
export function checkModelFit(modelId: string, hw: HardwareInfo): FitCheck | null {
  const params = parseParamCount(modelId);
  const est = estimateModelMemoryGb(modelId);
  if (params == null || est == null) return null;
  const budgetGb = hw.vramGb ?? hw.totalRamGb;
  const budgetKind: 'vram' | 'ram' = hw.vramGb != null ? 'vram' : 'ram';
  return { modelParamsB: params, estRequiredGb: est, budgetGb, budgetKind, fits: est <= budgetGb };
}
