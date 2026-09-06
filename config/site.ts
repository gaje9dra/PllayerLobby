export const siteConfig = {
  name: "ArenaX",
  description: "A competitive esports tournament platform for players and organizers.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  games: ["Stumble Guys", "Valorant"],
} as const;
