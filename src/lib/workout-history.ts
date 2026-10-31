import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http";
import { sessionSelect } from "./workouts";
import type { HistoryQuery } from "./history-input";
export async function workoutHistory(ownerId: string, query: HistoryQuery) {
 const base: Prisma.WorkoutSessionWhereInput = { ownerId, recordKind: "actual", ...(query.status !== "all" ? { status: query.status } : {}),
  localDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } };
 let after: Prisma.WorkoutSessionWhereInput | undefined;
 if (query.after) {
  const cursor = await db.workoutSession.findFirst({ where: { ...base, id: query.after }, select: { id: true, localDate: true, createdAt: true } });
  if (!cursor) throw new HttpError(400, "페이지 기준 기록이 변경됐습니다. 처음부터 다시 조회해주세요.");
  after = { OR: [{ localDate: { lt: cursor.localDate } }, { localDate: cursor.localDate, createdAt: { lt: cursor.createdAt } }, { localDate: cursor.localDate, createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
 }
 const rows = await db.workoutSession.findMany({ where: { AND: [base, ...(after ? [after] : [])] }, orderBy: [{ localDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 21, select: sessionSelect });
 const items = rows.slice(0, 20);
 return { items, hasMore: rows.length > 20, nextAfter: rows.length > 20 ? items.at(-1)!.id : null };
}
