import type { NextConfig } from "next";
// OpenNext-for-Cloudflare wires Cloudflare bindings into next dev so the local
// dev server matches the production Worker runtime. Safe no-op outside dev.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// The site was serving none of these. It has no accounts, sessions or cookies,
// so there is nothing to steal via CSRF — but a CSP is the second line under
// React's escaping if a rendering sink ever slips in, and frame-ancestors stops
// the leaderboard being framed and reskinned as someone else's benchmark.
//
// 'unsafe-inline' on style-src is required: Next injects inline <style> for the
// critical CSS path. script-src takes 'unsafe-inline' because the App Router
// emits inline hydration bootstrap scripts without a nonce in a static export.
// connect-src is pinned to the one API this site talks to.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.pipelinescore.ai",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  // Image optimization: Cloudflare Pages doesn't support Next's Image
  // Optimization API by default — disable to avoid a runtime crash on /
  // (hero.jpg is the only optimized image right now).
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
