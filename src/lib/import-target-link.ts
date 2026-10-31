import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { reviewHash } from "./import-review";
export const targetLinkSchema = z.object({ sourceId: z.string().min(1).max(100), targetKind: z.enum(["exercise", "routine_item", "session", "log"]),
 targetId: z.string().min(1).max(100), mappingHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
type Input = z.infer<typeof targetLinkSchema>;
async function targetSnapshot(tx: Prisma.TransactionClient, ownerId: string, input: Input) {
 let row: unknown;
 if (input.targetKind === "exercise") row = await tx.exercise.findFirst({ where: { id: input.targetId, ownerId } });
 if (input.targetKind === "routine_item") row = await tx.routineItem.findFirst({ where: { id: input.targetId, day: { version: { routine: { ownerId } } } }, include: { day: { select: { weekday: true, version: { select: { number: true, name: true } } } } } });
 if (input.targetKind === "session") row = await tx.workoutSession.findFirst({ where: { id: input.targetId, ownerId }, include: {
  exercises: { orderBy: { position: "asc" }, include: { sets: { orderBy: { position: "asc" } } } }, cardio: { orderBy: { position: "asc" } },
 } });
 if (input.targetKind === "log") row = await tx.sessionExercise.findFirst({ where: { id: input.targetId, session: { ownerId } }, include: { sets: { orderBy: { position: "asc" } }, session: { select: { id: true, recordKind: true, status: true, version: true } } } });
 if (!row) throw new Error("Target not found for this account; do not recreate automatically");
 // Convert Date to an ISO string before canonical hashing; no raw snapshots are persisted.
 return reviewHash(JSON.parse(JSON.stringify(row)));
}
// Caller must pass its existing transaction. This prepares a link, never creates application data.
export async function prepareTargetLink(tx: Prisma.TransactionClient, ownerId: string, value: unknown) {
 const input = targetLinkSchema.parse(value);
 const source = await tx.importSource.findFirst({ where: { id: input.sourceId, ownerId }, select: { sourceType: true } });
 if (!source) throw new Error("Source not found for this account");
 const kinds: Record<string, string> = { exercises: "exercise", exercise_clones: "exercise", routines: "routine_item", sessions: "session", logs: "log" };
 if (kinds[source.sourceType] !== input.targetKind) throw new Error("Source and target kinds differ");
 const snapshotHash = await targetSnapshot(tx, ownerId, input);
 const previous = await tx.importTarget.findUnique({ where: { sourceId: input.sourceId } });
 if (previous) {
  if (previous.ownerId !== ownerId || previous.targetKind !== input.targetKind || previous.targetId !== input.targetId || previous.mappingHash !== input.mappingHash) throw new Error("Mapping changed; new review required");
  if (previous.snapshotHash !== snapshotHash) throw new Error("Application target changed; refusing overwrite");
  return { id: previous.id, reused: true, state: previous.state };
 }
 const created = await tx.importTarget.create({ data: { ...input, ownerId, snapshotHash } });
 return { id: created.id, reused: false, state: created.state };
}
