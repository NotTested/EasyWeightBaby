import "dotenv/config";
import { readFile, stat, writeFile } from "node:fs/promises";
import { targetTemplate, validateTargets, dryRunTargets } from "../src/lib/import-target";
import { createPrismaClient } from "../src/lib/prisma-client";
async function read(path: string, max: number) { if ((await stat(path)).size > max) throw new Error("Input exceeds size limit"); return readFile(path, "utf8"); }
async function main() {
 const [mode, stagingPath, manifestPath, targetPath, ownerId] = process.argv.slice(2);
 if (!["template", "validate", "dry-run"].includes(mode) || !stagingPath || !manifestPath || !targetPath || (mode === "dry-run" && !ownerId)) throw new Error("Usage: notion:target template|validate|dry-run STAGING REVIEW TARGET [TEST_OWNER_ID]");
 const staging = await read(stagingPath, 64 * 1024 * 1024), manifest = JSON.parse(await read(manifestPath, 8 * 1024 * 1024));
 if (mode === "template") {
  await writeFile(targetPath, JSON.stringify(targetTemplate(staging, manifest), null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("Empty target template created; reviewed sources require explicit mappings."); return;
 }
 const value = JSON.parse(await read(targetPath, 8 * 1024 * 1024));
 const validated = validateTargets(staging, manifest, value);
 if (mode === "validate") { console.log(JSON.stringify({ canApply: false, targetHash: validated.targetHash, reviewed: validated.review.reviewed.length, deferred: validated.deferred, volumeKg: validated.volumeKg })); return; }
 const url = process.env.TEST_DATABASE_URL;
 if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL must target a _test database");
 if (process.env.DATABASE_URL) { const dev = new URL(process.env.DATABASE_URL), test = new URL(url); if ([dev.hostname, dev.port || "5432", dev.pathname].join(":" ) === [test.hostname, test.port || "5432", test.pathname].join(":")) throw new Error("Test DB must differ from development"); }
 const db = createPrismaClient(url);
 try { const { sampleSets, ...report } = await dryRunTargets(db, ownerId!, staging, manifest, value); console.log(JSON.stringify(report)); }
 finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Target validation failed"); process.exitCode = 1; });
