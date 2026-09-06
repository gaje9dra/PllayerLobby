import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not configured. Set it before running the database connection check.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Database connection successful.");
} catch (error) {
  console.error("Database connection failed.");
  console.error(error instanceof Error ? error.message : "Unknown database error.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
