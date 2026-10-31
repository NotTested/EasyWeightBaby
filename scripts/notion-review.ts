import "dotenv/config";
import { readFile, writeFile, stat } from "node:fs/promises";
import { reviewTemplate, dryRunReview } from "../src/lib/import-review";
import { createPrismaClient } from "../src/lib/prisma-client";
// No apply mode. Local trusted operator supplies the account; manifests cannot choose an owner.
async function main() {
 const [mode, stagingPath, manifestPath, ownerId] = process.argv.slice(2);
 if (!["template", "dry-run"].includes(mode) || !stagingPath || !manifestPath || (mode === "dry-run" && !ownerId)) throw new Error("Usage: notion:review template STAGING OUTPUT | dry-run STAGING MANIFEST OWNER_ID");
 if ((await stat(stagingPath)).size > 64 * 1024 * 1024) throw new Error("Staging exceeds 64 MiB");
 const staging = await readFile(stagingPath, "utf8");
 if (mode === "template") {
  await writeFile(manifestPath, JSON.stringify(reviewTemplate(staging), null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("Deferred review template created. No approvals or database writes."); return;
 }
 if ((await stat(manifestPath)).size > 8 * 1024 * 1024) throw new Error("Review manifest exceeds 8 MiB");
 const url = process.env.TEST_DATABASE_URL;
 if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL must target a _test database");
 if (process.env.DATABASE_URL) {
  const dev = new URL(process.env.DATABASE_URL), test = new URL(url);
  if ([dev.hostname, dev.port || "5432", dev.pathname].join(":") === [test.hostname, test.port || "5432", test.pathname].join(":")) throw new Error("Test database must differ from development");
 }
 const db = createPrismaClient(url);
 try { console.log(JSON.stringify(await dryRunReview(db, ownerId, staging, JSON.parse(await readFile(manifestPath, "utf8"))))); }
 finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Review failed"); process.exitCode = 1; });
