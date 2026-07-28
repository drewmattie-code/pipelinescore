import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /s/ is NOT disallowed here on purpose. Share pages carry
        // `robots: { index: false }` in their own metadata, which keeps them out
        // of the index while still letting Twitterbot / facebookexternalhit and
        // friends fetch the page to build the unfurl card. Blocking them here
        // instead would stop the card from rendering at all, which defeats the
        // entire point of a share link.
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://pipelinescore.ai/sitemap.xml",
    host: "https://pipelinescore.ai",
  };
}
