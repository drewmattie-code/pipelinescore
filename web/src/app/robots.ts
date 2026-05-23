import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Don't let crawlers index the per-submission share URLs or the search
        // permutations — those are useful for humans, useless for SEO.
        disallow: ["/s/", "/api/"],
      },
    ],
    sitemap: "https://pipelinescore.ai/sitemap.xml",
    host: "https://pipelinescore.ai",
  };
}
