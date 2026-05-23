// OpenNext config for Cloudflare Workers / Pages.
// Minimal — uses defaults. Override here only if we need ISR caching, R2,
// or custom queue/tag-cache wiring later.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
