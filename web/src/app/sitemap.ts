import type { MetadataRoute } from "next";
import { getLeaderboardModels, getUserDirectory } from "@/lib/api";

const SITE_URL = "https://pipelinescore.ai";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages = [
    { path: "/", priority: 1.0, freq: "daily" as const },
    { path: "/leaderboard", priority: 0.9, freq: "daily" as const },
    { path: "/leaderboard/hardware", priority: 0.9, freq: "daily" as const },
    { path: "/leaderboard/users", priority: 0.9, freq: "hourly" as const },
    { path: "/run", priority: 0.8, freq: "weekly" as const },
    { path: "/methodology", priority: 0.6, freq: "monthly" as const },
    { path: "/about", priority: 0.5, freq: "monthly" as const },
    { path: "/privacy", priority: 0.4, freq: "monthly" as const },
  ].map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  // Per-model pages
  const [models, users] = await Promise.all([
    getLeaderboardModels(),
    getUserDirectory(),
  ]);

  const modelPages = models.map((m) => ({
    url: `${SITE_URL}/models/${m.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Per-user dashboards. Cap at 200 to keep the sitemap reasonable.
  const userPages = users.slice(0, 200).map((u) => ({
    url: `${SITE_URL}/users/${encodeURIComponent(u.userNickname)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [...staticPages, ...modelPages, ...userPages];
}
