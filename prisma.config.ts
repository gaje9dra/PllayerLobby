import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Use the direct/session connection for Prisma CLI migrations when it is
    // provided. Runtime application traffic should use DATABASE_URL, which is
    // configured for Supabase transaction pooling on Netlify.
    url: process.env.DIRECT_URL?.trim() || env("DATABASE_URL"),
  },
});
