import type { Exercise } from "@prisma/client";
import { db } from "./db";
import { isAdmin } from "./access";
import { HttpError } from "./http";
import { normalizeExerciseName, type ExerciseItem, type ExerciseFields } from "./exercise-input";

type User = { id: string; role?: string };
export const visibleExercises = (user: User) => ({ OR: [{ ownerId: null }, { ownerId: user.id }] });
export function exerciseItem(item: Exercise, user: User): ExerciseItem {
  return { id: item.id, name: item.name, aliases: item.aliases, equipment: item.equipment as ExerciseFields["equipment"],
    category: item.category as ExerciseFields["category"], execution: item.execution as ExerciseFields["execution"],
    measurement: item.measurement as ExerciseFields["measurement"], benchAngle: item.benchAngle, notes: item.notes,
    active: item.active, version: item.version, scope: item.ownerId === null ? "shared" : "private",
    canEdit: item.ownerId === user.id || (item.ownerId === null && isAdmin(user)) };
}
export function exerciseData(data: ExerciseFields) {
  return { ...data, nameKey: normalizeExerciseName(data.name),
    searchText: [data.name, ...data.aliases].map(normalizeExerciseName).join("\n") };
}
export async function updateExercise(id: string, user: User, input: ExerciseFields & { version: number }) {
  const { version, ...fields } = input;
  return db.$transaction(async tx => {
    const item = await tx.exercise.findFirst({ where: { id, ...visibleExercises(user) } });
    if (!item) throw new HttpError(404, "종목을 찾을 수 없습니다.");
    if (item.ownerId === null && !isAdmin(user)) throw new HttpError(403, "공용 종목은 관리자만 수정할 수 있습니다.");
    const updated = await tx.exercise.updateMany({ where: { id, version },
      data: { ...exerciseData(fields), version: { increment: 1 } } });
    if (updated.count !== 1) throw new HttpError(409, "다른 곳에서 수정됐습니다. 목록을 새로 불러온 뒤 다시 편집해주세요.");
    return exerciseItem(await tx.exercise.findUniqueOrThrow({ where: { id } }), user);
  });
}
export function exerciseWriteError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    throw new HttpError(409, "같은 이름의 종목이 이미 있습니다. 비활성 종목도 확인해주세요.");
  }
  throw error;
}
