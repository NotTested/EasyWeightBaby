import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const idSchema = z.string().regex(/^[0-9a-f]{32}$/);
const groups = ["exercises", "exercise_clones", "routines", "sessions", "logs"] as const;
const sourceSchema = z.object({ csv: z.string().min(1).max(1000), row: z.number().int().min(2) }).strict();
const recordSchema = z.object({ notionId: idSchema.nullable(), title: z.string().max(1000), source: sourceSchema }).passthrough();
const stagingSchema = z.object({
 summary: z.object({ schemaVersion: z.literal(1), mode: z.literal("preview_only"), archiveSha256: hashSchema, errors: z.number().int().min(0) }).passthrough(),
 records: z.object({ exercises: z.array(recordSchema), exercise_clones: z.array(recordSchema), routines: z.array(recordSchema), sessions: z.array(recordSchema), logs: z.array(recordSchema) }).strict(),
 issues: z.array(z.object({ code: z.string(), source: z.union([sourceSchema, z.string()]), severity: z.enum(["info", "review", "error"]) }).passthrough()),
}).passthrough();
const decisionSchema = z.object({
 sourceRef: z.string(), source: sourceSchema, title: z.string().max(1000), sourceType: z.enum(groups), externalId: idSchema.nullable(), contentHash: hashSchema,
 decision: z.enum(["defer", "reviewed"]),
 resolutions: z.array(z.object({ issueIndex: z.number().int().min(0), note: z.string().trim().min(1).max(2000) }).strict()).max(200),
}).strict();
export const manifestSchema = z.object({ format: z.literal(1), archiveHash: hashSchema, stagingHash: hashSchema, decisions: z.array(decisionSchema).max(2000) }).strict();
function canonical(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(canonical);
 if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([k, v]) => [k, canonical(v)]));
 return value;
}
export const reviewHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const fileHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function readStaging(text: string) {
 if (Buffer.byteLength(text) > 64 * 1024 * 1024) throw new Error("Staging exceeds 64 MiB");
 const staging = stagingSchema.parse(JSON.parse(text));
 if (staging.summary.errors || staging.issues.some(i => i.severity === "error")) throw new Error("Staging has blocking errors");
 const rows = groups.flatMap(sourceType => staging.records[sourceType].map(record => ({ sourceType, record, sourceRef: `${sourceType}:${reviewHash(record.source)}` })));
 if (rows.length > 2000 || new Set(rows.map(r => r.sourceRef)).size !== rows.length) throw new Error("Duplicate/oversize source rows");
 const ids = rows.flatMap(r => r.record.notionId ? [r.record.notionId] : []);
 if (new Set(ids).size !== ids.length) throw new Error("Duplicate source identities");
 return { staging, rows };
}
export function reviewTemplate(stagingText: string) {
 const { staging, rows } = readStaging(stagingText);
 return { format: 1 as const, archiveHash: staging.summary.archiveSha256, stagingHash: fileHash(stagingText),
  decisions: rows.map(({ sourceRef, sourceType, record }) => ({ sourceRef, source: record.source, title: record.title, sourceType, externalId: record.notionId, contentHash: reviewHash(record), decision: "defer" as const, resolutions: [] })) };
}
export function validateReview(stagingText: string, value: unknown, options: { allowCloneReview?: boolean } = {}) {
 const { staging, rows } = readStaging(stagingText), manifest = manifestSchema.parse(value);
 if (manifest.archiveHash !== staging.summary.archiveSha256 || manifest.stagingHash !== fileHash(stagingText)) throw new Error("Review does not match this archive/staging snapshot");
 if (manifest.decisions.length !== rows.length || new Set(manifest.decisions.map(d => d.sourceRef)).size !== rows.length) throw new Error("Review must cover every source exactly once");
 const reviewed = [];
 for (const row of rows) {
  const decision = manifest.decisions.find(d => d.sourceRef === row.sourceRef);
  if (!decision || reviewHash(decision.source) !== reviewHash(row.record.source) || decision.title !== row.record.title || decision.sourceType !== row.sourceType || decision.externalId !== row.record.notionId || decision.contentHash !== reviewHash(row.record)) throw new Error("Review source binding mismatch");
  const applicable = staging.issues.flatMap((issue, index) => typeof issue.source === "object" && reviewHash(issue.source) === reviewHash(row.record.source) && issue.severity === "review" ? [index] : []);
  if (new Set(decision.resolutions.map(r => r.issueIndex)).size !== decision.resolutions.length || decision.resolutions.some(r => !applicable.includes(r.issueIndex))) throw new Error("Invalid review resolution");
  if (decision.decision === "reviewed") {
   if (!row.record.notionId) throw new Error("Unidentified source cannot be reviewed for import");
   if (row.sourceType === "exercise_clones" && !options.allowCloneReview) throw new Error("Clone merge mapping is deferred to the import writer stage");
   if (applicable.some(index => !decision.resolutions.some(r => r.issueIndex === index))) throw new Error("Unresolved source review issues");
   reviewed.push(decision);
  }
 }
 const sorted = { ...manifest, decisions: [...manifest.decisions].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef, "en")) };
 return { manifest: sorted, manifestHash: reviewHash(sorted), reviewed, deferred: rows.length - reviewed.length };
}
// Exercises and workouts are never written here. Even review ledger writes are rolled back.
export async function dryRunReview(db: PrismaClient, ownerId: string, stagingText: string, value: unknown) {
 const [{ name }] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
 if (!name.endsWith("_test")) throw new Error("Review dry-run requires a _test database");
 const review = validateReview(stagingText, value);
 const rollback = new Error("review dry-run rollback");
 let result: { mode: "dry_run"; canApply: false; reviewed: number; deferred: number; newSources: number; reusedSources: number } | undefined;
 try {
  await db.$transaction(async tx => {
   if (!await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } })) throw new Error("Review owner does not exist");
   const batch = await tx.importBatch.upsert({ where: { ownerId_stagingHash_manifestHash: { ownerId, stagingHash: review.manifest.stagingHash, manifestHash: review.manifestHash } },
    create: { ownerId, archiveHash: review.manifest.archiveHash, stagingHash: review.manifest.stagingHash, manifestHash: review.manifestHash }, update: {} });
   let newSources = 0, reusedSources = 0;
   for (const entry of review.reviewed) {
    const identity = { ownerId, provider: "notion", sourceType: entry.sourceType, externalId: entry.externalId! };
    const previous = await tx.importSource.findUnique({ where: { ownerId_provider_sourceType_externalId: identity } });
    const hash = reviewHash(entry);
    if (previous) {
     if (previous.contentHash !== entry.contentHash || previous.reviewHash !== hash) throw new Error("Source content or review changed; refusing overwrite");
     reusedSources++;
    } else {
     await tx.importSource.create({ data: { ...identity, contentHash: entry.contentHash, reviewHash: hash, review: entry, batchId: batch.id } }); newSources++;
    }
   }
   result = { mode: "dry_run", canApply: false, reviewed: review.reviewed.length, deferred: review.deferred, newSources, reusedSources };
   throw rollback;
  }, { timeout: 30000 });
 } catch (error) { if (error !== rollback) throw error; }
 if (!result) throw new Error("No dry-run result");
 return result;
}
