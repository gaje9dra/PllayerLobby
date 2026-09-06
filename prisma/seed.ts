import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const games = [
    {
      name: "Stumble Guys",
      slug: "stumble-guys",
      code: "STUMBLE_GUYS",
      description: "Compete in Stumble Guys tournaments on ArenaX.",
      isActive: true,
    },
    {
      name: "Valorant",
      slug: "valorant",
      code: "VALORANT",
      description: "Compete in Valorant tournaments on ArenaX.",
      isActive: true,
    },
  ];

  for (const game of games) {
    await prisma.game.upsert({
      where: {
        slug: game.slug,
      },
      update: {
        name: game.name,
        code: game.code,
        description: game.description,
        isActive: game.isActive,
      },
      create: game,
    });
  }

  console.log("Game seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Game seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
