import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import type { StartSessionInput } from "./session-input";

export const sessionSelect = { id: true, title: true, localDate: true, timeZone: true, status: true, version: true,
  startedAt: true, routineName: true, routineNumber: true, routineWeekday: true, createdAt: true, updatedAt: true,
} satisfies Prisma.WorkoutSessionSelect;
export const sessionDetailSelect = { ...sessionSelect, exercises: { orderBy: { position: "asc" }, select: {
  id: true, exerciseId: true, position: true, exerciseName: true, equipment: true, execution: true, measurement: true,
  sets: { orderBy: { position: "asc" }, select: { weightKg: true, dumbbellCount: true, reps: true, completed: true, side: true, kind: true, actualRir: true } },
  goalSets: true, goalMinReps: true, goalMaxReps: true, goalRir: true, benchAngle: true, notes: true,
} } } satisfies Prisma.WorkoutSessionSelect;
export async function findWorkout(id: string, ownerId: string) {
  const item = await db.workoutSession.findFirst({ where: { id, ownerId }, select: sessionDetailSelect });
  if (!item) throw new HttpError(404, "운동일지를 찾을 수 없습니다.");
  return item;
}
export async function startWorkout(user: { id: string; timeZone: string }, input: StartSessionInput) {
  const { requestId, ...payload } = input;
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  async function existing() {
    const previous = await db.workoutSession.findUnique({ where: { ownerId_startKey: { ownerId: user.id, startKey: requestId } } });
    if (!previous) return null;
    if (previous.startHash !== hash) throw new HttpError(409, "이미 사용된 시작 요청입니다. 새 요청으로 다시 시작해주세요.");
    return { item: await findWorkout(previous.id, user.id), reused: true };
  }
  const previous = await existing(); if (previous) return previous;
  try {
    const created = await db.$transaction(async tx => {
      let source: { routineVersionId: string; routineName: string; routineNumber: number; routineWeekday: number } | undefined;
      let exercises: Prisma.SessionExerciseCreateWithoutSessionInput[] = [];
      if (input.source) {
        const from = input.source;
        const version = await tx.routineVersion.findFirst({ where: { routineId: from.routineId, number: from.version, routine: { ownerId: user.id } },
          include: { days: { where: { weekday: from.weekday }, include: { items: { orderBy: { position: "asc" }, include: { exercise: true } } } } } });
        if (!version) throw new HttpError(404, "루틴 버전을 찾을 수 없습니다.");
        const day = version.days[0];
        if (!day || day.rest || !day.items.length) throw new HttpError(400, "휴식일입니다. 다른 계획 요일을 선택하거나 빈 운동으로 시작해주세요.");
        if (day.items.some(item => !item.exercise.active || item.exercise.measurement !== "reps" ||
          (item.exercise.ownerId !== null && item.exercise.ownerId !== user.id))) throw new HttpError(400, "사용할 수 없는 종목이 있습니다. 루틴을 수정하거나 빈 운동으로 시작해주세요.");
        source = { routineVersionId: version.id, routineName: version.name, routineNumber: version.number, routineWeekday: from.weekday };
        exercises = day.items.map((item, position) => ({ exercise: { connect: { id: item.exerciseId } }, position,
          exerciseName: item.exerciseName, equipment: item.equipment, execution: item.exercise.execution, measurement: item.exercise.measurement,
          goalSets: item.sets, goalMinReps: item.minReps, goalMaxReps: item.maxReps, goalRir: item.rir, benchAngle: item.benchAngle, notes: item.notes }));
      }
      return tx.workoutSession.create({ data: { ownerId: user.id, title: input.title, localDate: input.localDate, timeZone: user.timeZone,
        startedAt: new Date(), status: "in_progress", startKey: requestId, startHash: hash, ...source, exercises: { create: exercises } }, select: sessionDetailSelect });
    });
    return { item: created, reused: false };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const winner = await existing(); if (winner) return winner;
    }
    throw error;
  }
}

export async function saveActualWorkout(id: string, ownerId: string, input: import("./actual-input").ActualInput) {
  return db.$transaction(async tx => {
    const current = await tx.workoutSession.findFirst({ where: { id, ownerId }, include: { exercises: true } });
    if (!current) throw new HttpError(404, "운동일지를 찾을 수 없습니다.");
    if (current.status !== "in_progress") throw new HttpError(409, "진행 중인 운동만 수정할 수 있습니다.");
    if (current.version !== input.version) throw new HttpError(409, "다른 저장 내용이 있습니다. 입력을 확인하고 새로고침해주세요.");
    const ids = input.exercises.flatMap(e => e.id ? [e.id] : []);
    if (new Set(ids).size !== ids.length || current.exercises.some(e => !ids.includes(e.id)))
      throw new HttpError(400, "기존 종목을 누락하거나 중복할 수 없습니다.");
    const changed = await tx.workoutSession.updateMany({ where: { id, ownerId, version: input.version }, data: { version: { increment: 1 } } });
    if (!changed.count) throw new HttpError(409, "다른 저장 내용이 있습니다. 입력을 확인하고 새로고침해주세요.");
    for (const entry of input.exercises) {
      let exercise = current.exercises.find(e => e.id === entry.id);
      if (entry.id && (!exercise || exercise.exerciseId !== entry.exerciseId)) throw new HttpError(400, "잘못된 세션 종목입니다.");
      if (!exercise) {
        const source = await tx.exercise.findFirst({ where: { id: entry.exerciseId, active: true, measurement: "reps", OR: [{ ownerId }, { ownerId: null }] } });
        if (!source) throw new HttpError(400, "사용할 수 없는 종목입니다.");
        exercise = await tx.sessionExercise.create({ data: { sessionId: id, exerciseId: source.id, position: current.exercises.length,
          exerciseName: source.name, equipment: source.equipment, execution: source.execution, measurement: source.measurement,
          benchAngle: source.benchAngle, notes: "" } });
        current.exercises.push(exercise);
      }
      const dumbbell = ["dumbbell", "dumbbell_bench"].includes(exercise.equipment);
      for (const set of entry.sets) {
        if (dumbbell && set.completed && set.dumbbellCount === null) throw new HttpError(400, "덤벨 수를 입력해주세요.");
        if (!dumbbell && set.dumbbellCount !== null) throw new HttpError(400, "덤벨 종목만 덤벨 수를 기록합니다.");
        if (exercise.equipment === "bodyweight" && set.weightKg !== null && set.weightKg !== 0) throw new HttpError(400, "맨몸 종목의 외부 중량은 0kg입니다.");
      }
      await tx.workoutSet.deleteMany({ where: { sessionExerciseId: exercise.id } });
      await tx.workoutSet.createMany({ data: entry.sets.map((set, position) => ({ ...set, position, sessionExerciseId: exercise!.id })) });
    }
    return tx.workoutSession.findUniqueOrThrow({ where: { id }, select: sessionDetailSelect });
  });
}
