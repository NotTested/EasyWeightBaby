import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { comparisonDifferences, performanceSummary, type ComparisonResult } from "./performance-comparison";
const performanceSelect = { exerciseName: true, equipment: true, execution: true, measurement: true, benchAngle: true,
 sets: { orderBy: { position: "asc" }, select: { weightKg: true, dumbbellCount: true, reps: true, actualRir: true, side: true, kind: true, completed: true } },
} satisfies Prisma.SessionExerciseSelect;
export async function workoutComparison(ownerId: string, sessionId: string): Promise<ComparisonResult> {
 const current = await db.workoutSession.findFirst({ where: { id: sessionId, ownerId, recordKind: "actual" }, select: { id: true, localDate: true, version: true,
  exercises: { orderBy: { position: "asc" }, take: 41, select: { id: true, exerciseId: true, ...performanceSelect } },
 } });
 if (!current) throw new HttpError(404, "비교할 실제 운동 기록을 찾을 수 없습니다.");
 if (current.exercises.length > 40) throw new HttpError(400, "비교할 수 있는 종목 수를 초과했습니다.");
 const items = await Promise.all(current.exercises.map(async item => {
  const previous = await db.sessionExercise.findFirst({ where: { exerciseId: item.exerciseId,
   session: { ownerId, recordKind: "actual", status: "completed", localDate: { lt: current.localDate } }, sets: { some: { completed: true, kind: "working" } },
  }, orderBy: [{ session: { localDate: "desc" } }, { session: { createdAt: "desc" } }, { session: { id: "desc" } }, { position: "desc" }],
   select: { ...performanceSelect, session: { select: { id: true, title: true, localDate: true, timeZone: true } } } });
  return { id: item.id, exerciseId: item.exerciseId, current: performanceSummary(item), previous: previous ? { session: previous.session, performance: performanceSummary(previous), differences: comparisonDifferences(item, previous) } : null };
 }));
 return { sessionId: current.id, localDate: current.localDate, version: current.version, items };
}
