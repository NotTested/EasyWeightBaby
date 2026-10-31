import { db } from "@/lib/db";
import { ownerWhere } from "@/lib/access";
import { currentUser, HttpError, json, readJson, route, verifyOrigin } from "@/lib/http";
import { startSessionSchema } from "@/lib/session-input";
import { sessionSelect, startWorkout } from "@/lib/workouts";
export const GET = route(async request => {
  const user = await currentUser(request);
  const state = new URL(request.url).searchParams.get("status") ?? "all";
  if (!["all", "in_progress", "completed"].includes(state)) throw new HttpError(400, "조회 조건을 확인해주세요.");
  const kind = new URL(request.url).searchParams.get("recordKind") ?? "actual";
  if (!["actual", "test", "plan", "all"].includes(kind)) throw new HttpError(400, "기록 구분을 확인해주세요.");
  const items = await db.workoutSession.findMany({ where: { ...ownerWhere(user.id), ...(kind !== "all" ? { recordKind: kind } : {}), ...(state !== "all" ? { status: state } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 101, select: sessionSelect });
  return json({ items: items.slice(0, 100), hasMore: items.length > 100 });
});
export const POST = route(async request => {
  verifyOrigin(request); const user = await currentUser(request);
  const result = await startWorkout(user, startSessionSchema.parse(await readJson(request)));
  return json(result, result.reused ? 200 : 201);
});
