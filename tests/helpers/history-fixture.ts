import type { PrismaClient } from "@prisma/client";
export async function historyFixture(db: PrismaClient, ownerId: string, otherId: string, exerciseId: string) {
 const set = { position: 0, weightKg: 12, dumbbellCount: 1, reps: 10, completed: true, side: "left", kind: "working", actualRir: 0 };
 const exercise = { exerciseId, position: 0, exerciseName: "Historical name", equipment: "dumbbell_bench", execution: "alternating", measurement: "reps", benchAngle: "30", notes: "" };
 const daily = [];
 for (let day = 1; day <= 21; day++) daily.push(await db.workoutSession.create({ data: { ownerId, title: `History ${day}`, localDate: `2026-10-${String(day).padStart(2, "0")}`, status: "completed" } }));
 const previous = daily[19];
 await db.sessionExercise.create({ data: { ...exercise, sessionId: previous.id, sets: { create: [set, { ...set, position: 1, side: "right", reps: 8, actualRir: null }, { ...set, position: 2, kind: "warmup", actualRir: 9 }] } } });
 for (const entry of [
  { ownerId, title: "Test excluded", localDate: "2026-10-28", recordKind: "test", status: "completed" },
  { ownerId, title: "Plan excluded", localDate: "2026-10-28", recordKind: "plan", status: "completed" },
  { ownerId, title: "Ongoing excluded", localDate: "2026-10-28", recordKind: "actual", status: "in_progress" },
  { ownerId: otherId, title: "Other owner excluded", localDate: "2026-10-28", recordKind: "actual", status: "completed" },
  { ownerId, title: "Same day excluded", localDate: "2026-10-29", recordKind: "actual", status: "completed" },
 ]) await db.workoutSession.create({ data: { ...entry, exercises: { create: { ...exercise, sets: { create: set } } } } });
 await db.workoutSession.create({ data: { ownerId, title: "Warmup excluded", localDate: "2026-10-28", status: "completed", exercises: { create: { ...exercise, sets: { create: { ...set, kind: "warmup" } } } } } });
 await db.workoutSession.create({ data: { ownerId, title: "Prefill excluded", localDate: "2026-10-28", status: "completed", exercises: { create: { ...exercise, sets: { create: { ...set, completed: false, actualRir: null } } } } } });
 const current = await db.workoutSession.create({ data: { ownerId, title: "Current workout", localDate: "2026-10-29", exercises: { create: { ...exercise, exerciseName: "Current name", equipment: "dumbbell", benchAngle: "", sets: { create: [{ ...set, weightKg: 0, reps: 0 }, { ...set, position: 1, side: "right", completed: false, actualRir: null }] } } } } });
 return { current, previous, daily };
}
