import type { MetadataRoute } from "next";
import { TournamentStatus } from "@/app/generated/prisma/client";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/prisma";

const PUBLIC_STATUSES = [
  TournamentStatus.UPCOMING,
  TournamentStatus.REGISTRATION_OPEN,
  TournamentStatus.REGISTRATION_CLOSED,
  TournamentStatus.LIVE,
  TournamentStatus.COMPLETED,
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tournaments = await prisma.tournament.findMany({
    where: {
      status: { in: [...PUBLIC_STATUSES] },
      game: { isActive: true },
    },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const baseUrl = siteConfig.url.replace(/\/$/, "");
  const publicPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/tournaments`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  return [
    ...publicPages,
    ...tournaments.map((tournament) => ({
      url: `${baseUrl}/tournaments/${encodeURIComponent(tournament.slug)}`,
      lastModified: tournament.updatedAt,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
  ];
}
