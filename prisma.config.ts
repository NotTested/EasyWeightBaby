import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // generate/validate do not connect to a DB. migrate requires DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
