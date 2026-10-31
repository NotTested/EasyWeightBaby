import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { exerciseFields, normalizeExerciseName } from "./exercise-input";
import { actualSetSchema, cardioRecordSchema } from "./actual-input";
import { routineFields } from "./routine-input";
import { localDateSchema } from "./session-input";
import { lastWorkingIndex, setVolumeKg } from "./set-performance";
import { readStaging, validateReview, reviewHash, fileHash } from "./import-review";
const id = z.string().regex(/^[0-9a-f]{32}$/), hash = z.string().regex(/^[0-9a-f]{64}$/);
const note = z.string().trim().min(1).max(2000);
const routineDay = routineFields.shape.days.element;
const routineItem = routineDay.shape.items.element.safeExtend({ sourceId: id, exerciseId: id });
const routine = routineFields.extend({ key: z.string().min(1).max(80), mappingNote: note,
 days: z.array(routineDay.safeExtend({ items: z.array(routineItem).max(20) })).length(7).refine(days => new Set(days.map(d => d.weekday)).size === 7),
}).strict();
export const targetPlanSchema = z.object({
 format: z.literal(1), stagingHash: hash, manifestHash: hash,
 exercises: z.array(z.discriminatedUnion("action", [
  z.object({ sourceId: id, action: z.literal("create"), fields: exerciseFields, mappingNote: note }).strict(),
  z.object({ sourceId: id, action: z.literal("merge"), intoSourceId: id, mappingNote: note }).strict(),
 ])).max(500),
 routines: z.array(routine).max(50),
 sessions: z.array(z.object({ sourceId: id, title: z.string().trim().min(1).max(100), localDate: localDateSchema,
  recordKind: z.enum(["actual", "test", "plan"]), status: z.enum(["in_progress", "completed", "planned"]), actualNotes: z.string().max(5000),
  cardio: z.array(cardioRecordSchema).max(20), mappingNote: note,
 }).strict()).max(500),
 logs: z.array(z.object({ sourceId: id, sessionSourceId: id, exerciseSourceId: id, position: z.number().int().min(0).max(39),
  snapshot: exerciseFields.pick({ name: true, equipment: true, execution: true, measurement: true }).strict(),
  benchAngle: z.string().max(40), notes: z.string().max(2000), rirDecision: z.enum(["preserve-last", "defer"]), mappingNote: note,
  sets: z.array(actualSetSchema.safeExtend({ sourceSlot: z.number().int().min(1).max(4) })).max(30),
 }).strict()).max(1000),
}).strict();
export function targetTemplate(stagingText: string, manifest: unknown) {
 const review = validateReview(stagingText, manifest, { allowCloneReview: true });
 return { format: 1 as const, stagingHash: fileHash(stagingText), manifestHash: review.manifestHash, exercises: [], routines: [], sessions: [], logs: [] };
}
export function validateTargets(stagingText: string, manifest: unknown, value: unknown) {
 const review = validateReview(stagingText, manifest, { allowCloneReview: true }), plan = targetPlanSchema.parse(value);
 if (plan.stagingHash !== fileHash(stagingText) || plan.manifestHash !== review.manifestHash) throw new Error("Target plan snapshot/review mismatch");
 const { rows } = readStaging(stagingText), sources = new Map(rows.filter(r => r.record.notionId).map(r => [r.record.notionId!, r]));
 const reviewed = new Map(review.reviewed.map(r => [r.externalId!, r]));
 const used = new Set<string>();
 function use(sourceId: string, types: string[]) {
  const row = sources.get(sourceId);
  if (!row || !reviewed.has(sourceId) || !types.includes(row.sourceType) || used.has(sourceId)) throw new Error("Target references deferred, duplicate or wrong source");
  used.add(sourceId); return row.record;
 }
 const created = new Map(plan.exercises.filter(e => e.action === "create").map(e => [e.sourceId, e]));
 if (new Set(plan.exercises.map(e => e.sourceId)).size !== plan.exercises.length) throw new Error("Duplicate exercise mapping");
 for (const entry of plan.exercises) {
  use(entry.sourceId, ["exercises", "exercise_clones"]); const source = sources.get(entry.sourceId)!;
  if (entry.action === "merge") {
   const target = created.get(entry.intoSourceId);
   if (entry.sourceId === entry.intoSourceId || !target || sources.get(target.sourceId)?.sourceType !== "exercises") throw new Error("Merge must point directly to a created original exercise");
  } else if (source.sourceType === "exercise_clones") throw new Error("Clones must explicitly merge or remain deferred");
 }
 const resolved = (sourceId: string) => {
  const mapping = plan.exercises.find(e => e.sourceId === sourceId);
  if (!mapping) throw new Error("Exercise source is not mapped in this plan");
  const target = mapping.action === "create" ? mapping : created.get(mapping.intoSourceId)!;
  if (!target) throw new Error("Unresolved exercise merge");
  return target;
 };
 const names = [...created.values()].map(e => normalizeExerciseName(e.fields.name));
 if (new Set(names).size !== names.length) throw new Error("Created exercises collide by normalized name");
 const relation = (row: typeof rows[number]["record"], field: string, expected: string) => {
  const parsed = z.object({ relations: z.record(z.string(), z.array(id)) }).parse(row);
  if (parsed.relations[field]?.length !== 1 || parsed.relations[field][0] !== expected) throw new Error("Target changes source relation");
 };
 if (new Set(plan.routines.map(r => r.key)).size !== plan.routines.length) throw new Error("Duplicate routine key");
 for (const r of plan.routines) for (const day of r.days) for (const item of day.items) {
  const row = use(item.sourceId, ["routines"]); relation(row, "종목", item.exerciseId);
  const exercise = resolved(item.exerciseId);
  if (exercise.fields.measurement !== "reps") throw new Error("Routine item requires a repetition exercise");
  const candidate = row.candidate as Record<string, unknown> | undefined;
  if (candidate?.weekday !== undefined && candidate.weekday !== day.weekday) throw new Error("Routine weekday changed");
 }
 const sessions = new Map(plan.sessions.map(s => [s.sourceId, s]));
 for (const s of plan.sessions) {
  const row = use(s.sourceId, ["sessions"]);
  if (row.recordKind !== s.recordKind || row.localDate !== s.localDate || row.status !== s.status) throw new Error("Session kind/date/status must preserve source");
 }
 const positions = new Set<string>();
 let volumeKg = 0;
 for (const log of plan.logs) {
  const row = use(log.sourceId, ["logs"]); relation(row, "세션", log.sessionSourceId); relation(row, "종목", log.exerciseSourceId);
  const session = sessions.get(log.sessionSourceId), exercise = resolved(log.exerciseSourceId);
  if (!session || session.recordKind !== row.recordKind || session.localDate !== row.localDate) throw new Error("Log and session metadata differ");
  if (log.snapshot.measurement !== "reps") throw new Error("Strength log requires a repetition snapshot");
  const positionKey = `${log.sessionSourceId}:${log.position}`;
  if (positions.has(positionKey)) throw new Error("Duplicate session exercise position"); positions.add(positionKey);
  const source = z.object({ setSlots: z.array(z.object({ sourceSlot: z.number().int().min(1).max(4), reps: z.string().nullable(), weightKg: z.string().nullable() })), lastRir: z.string().nullable(), lastRirCandidateSlot: z.number().int().nullable() }).parse(row);
  const slots = new Set(source.setSlots.map(s => s.sourceSlot));
  if (log.sets.some(s => !slots.has(s.sourceSlot)) || [...slots].some(slot => !log.sets.some(s => s.sourceSlot === slot))) throw new Error("Every original set slot must be explicitly mapped");
  for (const slot of slots) {
   const mapped = log.sets.filter(s => s.sourceSlot === slot);
   const original = source.setSlots.find(s => s.sourceSlot === slot)!;
   if (original.weightKg !== null && (!Number.isFinite(Number(original.weightKg)) || mapped.some(s => s.weightKg !== Number(original.weightKg)))) throw new Error("Known source weight must be preserved");
   if (original.reps !== null && (!Number.isInteger(Number(original.reps)) || Number(original.reps) < 0 || Number(original.reps) > 1000 || (Number(original.reps) === 0 && mapped.some(s => s.reps !== 0)) || (mapped.length === 1 && mapped[0].reps !== Number(original.reps)) || (mapped.length === 2 && mapped.some(s => s.reps === null)))) throw new Error("Known source reps/zero must be preserved or explicitly split");
   if (mapped.length > 2 || (mapped.length === 2 && new Set(mapped.map(s => s.side)).size !== 2) || (mapped.length === 2 && !mapped.every(s => s.side === "left" || s.side === "right"))) throw new Error("Split slot requires one left and one right row");
  }
  const last = lastWorkingIndex(log.sets), rir = source.lastRir === null ? null : Number(source.lastRir);
  if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 10)) throw new Error("Invalid source RIR");
  if (log.rirDecision === "defer" || rir === null) {
   if (log.sets.some(s => s.actualRir !== null)) throw new Error("Deferred or missing source RIR cannot be invented");
  } else if (last < 0 || log.sets[last].sourceSlot !== source.lastRirCandidateSlot || log.sets[last].actualRir !== rir || log.sets.some((s, index) => index !== last && s.actualRir !== null)) throw new Error("Source RIR must belong only to the last performed working row");
  for (const set of log.sets) {
   const dumbbell = ["dumbbell", "dumbbell_bench"].includes(log.snapshot.equipment);
   if (dumbbell && set.completed && set.dumbbellCount === null) throw new Error("Missing dumbbell count");
   if (!dumbbell && set.dumbbellCount !== null) throw new Error("Dumbbell count on non-dumbbell exercise");
   if (log.snapshot.equipment === "bodyweight" && set.weightKg !== null && set.weightKg !== 0) throw new Error("Bodyweight external load must be zero");
   if (session.recordKind === "actual" && set.completed) volumeKg += setVolumeKg(set, log.snapshot.equipment)!;
  }
 }
 if (used.size !== reviewed.size) throw new Error("Every reviewed source must have exactly one target mapping");
 return { plan, review, targetHash: reviewHash(plan), volumeKg, deferred: review.deferred };
}
export async function dryRunTargets(db: PrismaClient, ownerId: string, stagingText: string, manifest: unknown, value: unknown) {
 const [{ name }] = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
 if (!name.endsWith("_test")) throw new Error("Target dry-run requires a _test database");
 const validated = validateTargets(stagingText, manifest, value), { plan, review } = validated;
 const rollback = new Error("target dry-run rollback");
 let result: { mode: string; canApply: false; targetHash: string; counts: Record<string, number>; volumeKg: number; recordKinds: string[]; sampleSets: Array<{ side: string; reps: number | null; actualRir: number | null }> } | undefined;
 try {
  await db.$transaction(async tx => {
   const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { timeZone: true } });
   if (!owner) throw new Error("Target owner does not exist");
   const batch = await tx.importBatch.upsert({ where: { ownerId_stagingHash_manifestHash: { ownerId, stagingHash: review.manifest.stagingHash, manifestHash: review.manifestHash } },
    create: { ownerId, stagingHash: review.manifest.stagingHash, manifestHash: review.manifestHash, archiveHash: review.manifest.archiveHash }, update: {} });
   for (const entry of review.reviewed) {
    const identity = { ownerId, provider: "notion", sourceType: entry.sourceType, externalId: entry.externalId! };
    const previous = await tx.importSource.findUnique({ where: { ownerId_provider_sourceType_externalId: identity } });
    if (previous && (previous.contentHash !== entry.contentHash || previous.reviewHash !== reviewHash(entry))) throw new Error("Source review changed; refusing overwrite");
    if (!previous) await tx.importSource.create({ data: { ...identity, batchId: batch.id, contentHash: entry.contentHash, reviewHash: reviewHash(entry), review: entry } });
   }
   const exercises = new Map<string, Awaited<ReturnType<typeof tx.exercise.create>>>();
   for (const entry of plan.exercises) if (entry.action === "create") {
    const { fields } = entry, nameKey = normalizeExerciseName(fields.name);
    // Always private, new records. Existing application IDs and shared writes are unsupported.
    const item = await tx.exercise.create({ data: { ...fields, ownerId, scopeKey: `user:${ownerId}`, nameKey, searchText: [fields.name, ...fields.aliases].map(normalizeExerciseName).join("\n") } });
    exercises.set(entry.sourceId, item);
   }
   for (const entry of plan.exercises) if (entry.action === "merge") exercises.set(entry.sourceId, exercises.get(entry.intoSourceId)!);
   const getExercise = (sourceId: string) => { const item = exercises.get(sourceId); if (!item) throw new Error("Missing mapped exercise"); return item; };
   for (const r of plan.routines) {
    const created = await tx.routine.create({ data: { ownerId, name: r.name } });
    await tx.routineVersion.create({ data: { routineId: created.id, number: 1, name: r.name, days: { create: r.days.map(day => ({ weekday: day.weekday, rest: day.rest, items: { create: day.items.map((item, position) => {
     const exercise = getExercise(item.exerciseId);
     return { position, exerciseId: exercise.id, exerciseName: exercise.name, equipment: exercise.equipment, sets: item.sets, minReps: item.minReps, maxReps: item.maxReps, rir: item.rir, benchAngle: item.benchAngle, notes: item.notes };
    }) } })) } } });
   }
   const sessionIds: string[] = [];
   for (const s of plan.sessions) {
    const data: Prisma.WorkoutSessionCreateInput = { owner: { connect: { id: ownerId } }, title: s.title, localDate: s.localDate, timeZone: owner.timeZone, recordKind: s.recordKind, status: s.status,
     actualNotes: s.actualNotes, startedAt: null, endedAt: null, cardio: { create: s.cardio.map((cardio, position) => ({ ...cardio, position })) },
     exercises: { create: plan.logs.filter(log => log.sessionSourceId === s.sourceId).map(log => { const exercise = getExercise(log.exerciseSourceId); return {
      exercise: { connect: { id: exercise.id } }, position: log.position, exerciseName: log.snapshot.name, equipment: log.snapshot.equipment, execution: log.snapshot.execution, measurement: log.snapshot.measurement,
      benchAngle: log.benchAngle, notes: log.notes, sets: { create: log.sets.map(({ sourceSlot, ...set }, position) => ({ ...set, position })) },
     }; }) } };
    sessionIds.push((await tx.workoutSession.create({ data })).id);
   }
   const snapshot = await tx.workoutSession.findMany({ where: { id: { in: sessionIds }, ownerId }, include: { exercises: { include: { sets: { orderBy: { position: "asc" } } } }, cardio: true } });
   for (const saved of snapshot) {
    const sourceId = plan.sessions[sessionIds.indexOf(saved.id)].sourceId;
    for (const item of saved.exercises) {
     const expected = plan.logs.find(log => log.sessionSourceId === sourceId && log.position === item.position)!.snapshot;
     if (item.exerciseName !== expected.name || item.equipment !== expected.equipment || item.execution !== expected.execution || item.measurement !== expected.measurement) throw new Error("Historical exercise snapshot was not preserved");
    }
   }
   const persistedVolume = snapshot.filter(s => s.recordKind === "actual").reduce((sum, s) => sum + s.exercises.reduce((subtotal, e) => subtotal + e.sets.filter(set => set.completed).reduce((total, set) => total + setVolumeKg(set, e.equipment)!, 0), 0), 0);
   if (Math.abs(persistedVolume - validated.volumeKg) > 1e-8 || snapshot.some(s => s.startedAt !== null || s.endedAt !== null || s.exercises.some(e => e.goalSets !== null || e.goalMinReps !== null || e.goalMaxReps !== null || e.goalRir !== null))) throw new Error("Persisted graph does not preserve import invariants");
   result = { mode: "target_dry_run", canApply: false, targetHash: validated.targetHash,
    counts: { exercises: plan.exercises.filter(e => e.action === "create").length, mergedSources: plan.exercises.filter(e => e.action === "merge").length, routines: plan.routines.length, sessions: snapshot.length, logs: snapshot.reduce((n, s) => n + s.exercises.length, 0), sets: snapshot.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0), cardio: snapshot.reduce((n, s) => n + s.cardio.length, 0) },
    volumeKg: persistedVolume, recordKinds: snapshot.map(s => s.recordKind), sampleSets: snapshot.flatMap(s => s.exercises.flatMap(e => e.sets.map(set => ({ side: set.side, reps: set.reps, actualRir: set.actualRir })))),
   };
   throw rollback;
  }, { timeout: 30000 });
 } catch (error) { if (error !== rollback) throw error; }
 if (!result) throw new Error("No target dry-run result");
 return result;
}
