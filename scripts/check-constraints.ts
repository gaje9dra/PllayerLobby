import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function expectUniqueViolation(
  operation: () => Promise<unknown>,
  description: string,
) {
  try {
    await operation();
    throw new Error(`${description} was not enforced.`);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `${description} was not enforced.`
    ) {
      throw error;
    }

    console.log(`${description} passed.`);
  }
}

async function main() {
  const temporaryGame = await prisma.game.create({
    data: {
      name: "Temporary Constraint Test Game",
      slug: `temporary-constraint-${Date.now()}`,
      code: `TEMP_${Date.now()}`,
      isActive: true,
    },
  });

  let temporaryTournamentId: string | null = null;

  try {
    await expectUniqueViolation(
      () =>
        prisma.game.create({
          data: {
            name: "Duplicate Game Slug Test",
            slug: temporaryGame.slug,
            code: `DUPLICATE_SLUG_${Date.now()}`,
            isActive: true,
          },
        }),
      "Game.slug uniqueness",
    );

    await expectUniqueViolation(
      () =>
        prisma.game.create({
          data: {
            name: "Duplicate Game Code Test",
            slug: `duplicate-code-${Date.now()}`,
            code: temporaryGame.code,
            isActive: true,
          },
        }),
      "Game.code uniqueness",
    );

    const temporaryTournament = await prisma.tournament.create({
      data: {
        gameId: temporaryGame.id,
        name: "Temporary Constraint Test Tournament",
        slug: `temporary-tournament-${Date.now()}`,
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        entryFee: 0,
        prizePool: 0,
        maxParticipants: 10,
        tournamentFormat: "SOLO",
        region: "India",
        status: "DRAFT",
        joiningWindowMinutes: 10,
      },
    });

    temporaryTournamentId = temporaryTournament.id;

    await expectUniqueViolation(
      () =>
        prisma.tournament.create({
          data: {
            gameId: temporaryGame.id,
            name: "Duplicate Tournament Slug Test",
            slug: temporaryTournament.slug,
            startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
            entryFee: 0,
            prizePool: 0,
            maxParticipants: 10,
            tournamentFormat: "SOLO",
            region: "India",
            status: "DRAFT",
            joiningWindowMinutes: 10,
          },
        }),
      "Tournament.slug uniqueness",
    );
  } finally {
    if (temporaryTournamentId) {
      await prisma.tournament.delete({
        where: {
          id: temporaryTournamentId,
        },
      });
    }

    await prisma.game.delete({
      where: {
        id: temporaryGame.id,
      },
    });

    console.log("Temporary constraint test records deleted successfully.");
  }
}

main()
  .catch((error) => {
    console.error("Constraint test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
