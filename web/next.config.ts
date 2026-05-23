import type { NextConfig } from "next";
// OpenNext-for-Cloudflare wires Cloudflare bindings into next dev so the local
// dev server matches the production Worker runtime. Safe no-op outside dev.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Image optimization: Cloudflare Pages doesn't support Next's Image
  // Optimization API by default — disable to avoid a runtime crash on /
  // (hero.jpg is the only optimized image right now).
  images: { unoptimized: true },
};

initOpenNextCloudflareForDev();

export default nextConfig;
