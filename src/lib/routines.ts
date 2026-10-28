import { db } from "./db";
import { HttpError } from "./http";
import { visibleExercises } from "./exercises";
import type { RoutinePlan } from "./routine-input";

export async function routineDetail(id: string, ownerId: string, number?: number) {
  const routine = await db.routine.findFirst({ where: { id, ownerId } });
  if (!routine) throw new HttpError(404, "루틴을 찾을 수 없습니다.");
  const snapshot = await db.routineVersion.findUnique({ where: { routineId_number: { routineId: id, number: number ?? routine.version } },
    include: { days: { orderBy: { weekday: "asc" }, include: { items: { orderBy: { position: "asc" } } } } } });
  if (!snapshot) throw new HttpError(404, "루틴 버전을 찾을 수 없습니다.");
  return { id, name: snapshot.name, version: snapshot.number, currentVersion: routine.version,
    days: snapshot.days.map(day => ({ weekday: day.weekday, rest: day.rest, items: day.items.map(item => ({
      exerciseId: item.exerciseId, exerciseName: item.exerciseName, sets: item.sets, minReps: item.minReps,
      maxReps: item.maxReps, rir: item.rir, benchAngle: item.benchAngle, notes: item.notes,
    })) })) };
}
export async function saveRoutine(ownerId: string, plan: RoutinePlan, existing?: { id: string; version: number }) {
  const id = await db.$transaction(async tx => {
    if (existing && !await tx.routine.findFirst({ where: { id: existing.id, ownerId } })) throw new HttpError(404, "루틴을 찾을 수 없습니다.");
    const ids = [...new Set(plan.days.flatMap(day => day.items.map(item => item.exerciseId)))];
    const exercises = await tx.exercise.findMany({ where: { id: { in: ids }, ...visibleExercises({ id: ownerId }), active: true, measurement: "reps" } });
    if (exercises.length !== ids.length) throw new HttpError(400, "활성 상태의 공용·내 반복수 종목을 선택해주세요. 비활성 종목은 교체가 필요합니다.");
    let routineId: string, number: number;
    if (existing) {
      const updated = await tx.routine.updateMany({ where: { id: existing.id, ownerId, version: existing.version }, data: { name: plan.name, version: { increment: 1 } } });
      if (updated.count !== 1) throw new HttpError(409, "다른 곳에서 수정됐습니다. 최신 버전을 다시 불러와주세요.");
      routineId = existing.id; number = existing.version + 1;
    } else {
      const routine = await tx.routine.create({ data: { ownerId, name: plan.name } });
      routineId = routine.id; number = 1;
    }
    await tx.routineVersion.create({ data: { routineId, number, name: plan.name, days: { create: plan.days.map(day => ({
      weekday: day.weekday, rest: day.rest, items: { create: day.items.map((item, position) => {
        const exercise = exercises.find(value => value.id === item.exerciseId)!;
        return { ...item, position, exerciseName: exercise.name, equipment: exercise.equipment };
      }) },
    })) } } });
    return routineId;
  });
  // Return the version this request saved, even if another editor commits immediately afterwards.
  return routineDetail(id, ownerId, existing ? existing.version + 1 : 1);
}
