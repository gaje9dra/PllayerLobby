import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const game = await prisma.game.findUnique({
    where: {
      slug: "valorant",
    },
  });

  if (!game) {
    throw new Error("Valorant game seed was not found.");
  }

  let tournamentId: string | null = null;

  try {
    const tournament = await prisma.tournament.create({
      data: {
        gameId: game.id,
        name: "Temporary Database Value Test",
        slug: `temporary-value-test-${Date.now()}`,
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        entryFee: "10.50",
        prizePool: "1000.75",
        maxParticipants: 10,
        tournamentFormat: "SOLO",
        region: "India",
        status: "DRAFT",
        joiningWindowMinutes: 10,
      },
    });

    tournamentId = tournament.id;

    if (!tournament.entryFee.equals("10.50")) {
      throw new Error(
        `entryFee Decimal test failed. Received: ${tournament.entryFee.toString()}`,
      );
    }

    if (!tournament.prizePool.equals("1000.75")) {
      throw new Error(
        `prizePool Decimal test failed. Received: ${tournament.prizePool.toString()}`,
      );
    }

    if (!(tournament.createdAt instanceof Date)) {
      throw new Error("createdAt timestamp test failed.");
    }

    if (!(tournament.updatedAt instanceof Date)) {
      throw new Error("updatedAt timestamp test failed.");
    }

    console.log("Decimal monetary fields passed.");
    console.log("createdAt timestamp passed.");
    console.log("updatedAt timestamp passed.");
  } finally {
    if (tournamentId) {
      await prisma.tournament.delete({
        where: {
          id: tournamentId,
        },
      });

      console.log("Temporary tournament deleted successfully.");
    }
  }
}

main()
  .catch((error) => {
    console.error("Tournament database check failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
