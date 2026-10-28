import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createPrismaClient(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL을 설정하세요.");
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL은 PostgreSQL 연결 주소여야 합니다.");
  }
  // schema is a Prisma option, not a node-postgres connection parameter.
  const schema = url.searchParams.get("schema") ?? "public";
  url.searchParams.delete("schema");
  const adapter = new PrismaPg({ connectionString: url.toString() }, { schema });
  return new PrismaClient({ adapter });
}
