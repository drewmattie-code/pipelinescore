/**
 * Hand-maintained street-price approximations (USD, June 2026) for the
 * hardware tags on the board. GPU tags are the card(s); Mac tags are the
 * machine; CPU-only tags are a CPU + RAM platform estimate. Used for the
 * value (score-per-dollar) column. Rigs without a price (cloud-api,
 * lab-baseline, unknown tags) are excluded from value ranking.
 */
const RIG_PRICES_USD: Record<string, number> = {
  // NVIDIA consumer
  "rtx-3060-12gb": 280,
  "rtx-3080-10gb": 450,
  "rtx-3090-24gb": 900,
  "4x-rtx-3090": 3600,
  "rtx-4070-12gb": 520,
  "rtx-4080-16gb": 950,
  "rtx-4080-16gb-offload": 950,
  "rtx-4090-24gb": 1800,
  "2x-rtx-4090": 3600,
  // NVIDIA datacenter
  "a6000-48gb": 4200,
  "a100-40gb": 7500,
  "a100-80gb": 14000,
  "h100-80gb": 27000,
  "h200-141gb": 32000,
  "b200-192gb": 38000,
  "dgx-h100": 270000,
  // Apple Silicon
  "m1-air-8gb": 700,
  "m2-air-16gb": 950,
  "m3-air-16gb": 1100,
  "m2-pro-16gb": 1300,
  "macbook-pro-m3-pro-18gb": 1600,
  "m3-pro-36gb": 2000,
  "m4-pro-48gb": 2400,
  "m3-max-64gb": 3200,
  "m3-max-128gb": 4700,
  "m2-ultra-192gb": 5600,
  "m3-ultra-256gb": 7500,
  // CPU + mixed platforms
  "ryzen-7950x-cpu-only": 800,
  "ryzen-5950x-rtx-3060": 800,
  "ryzen-7950x-rtx-3090": 1700,
  "snapdragon-x-elite-32gb": 1100,
};

/** Price for a tag; lab- prefixed duplicates resolve to the base rig. */
export function priceFor(tag: string): number | undefined {
  if (RIG_PRICES_USD[tag] !== undefined) return RIG_PRICES_USD[tag];
  if (tag.startsWith("lab-")) return RIG_PRICES_USD[tag.slice(4)];
  return undefined;
}
