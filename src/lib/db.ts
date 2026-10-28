import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma-client";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? createPrismaClient(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
