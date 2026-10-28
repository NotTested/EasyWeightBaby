import { db } from "@/lib/db";
import { isAdmin } from "@/lib/access";
import { currentUser, HttpError, json, readJson, route, verifyOrigin } from "@/lib/http";
import { createExerciseSchema, normalizeExerciseName } from "@/lib/exercise-input";
import { exerciseData, exerciseItem, exerciseWriteError, visibleExercises } from "@/lib/exercises";

export const GET = route(async request => {
  const user = await currentUser(request);
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const state = params.get("state") ?? "active";
  if (q.length > 80 || !["active", "all"].includes(state)) throw new HttpError(400, "검색 조건을 확인하세요.");
  const items = await db.exercise.findMany({ where: { ...visibleExercises(user),
    ...(state === "active" ? { active: true } : {}), ...(q ? { searchText: { contains: normalizeExerciseName(q) } } : {}),
  }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 101 });
  return json({ items: items.slice(0, 100).map(item => exerciseItem(item, user)), hasMore: items.length > 100 });
});
export const POST = route(async request => {
  verifyOrigin(request);
  const user = await currentUser(request);
  const { scope, ...fields } = createExerciseSchema.parse(await readJson(request));
  if (scope === "shared" && !isAdmin(user)) throw new HttpError(403, "공용 종목은 관리자만 등록할 수 있습니다.");
  try {
    const item = await db.exercise.create({ data: { ...exerciseData(fields), ownerId: scope === "shared" ? null : user.id,
      scopeKey: scope === "shared" ? "shared" : `user:${user.id}` } });
    return json({ item: exerciseItem(item, user) }, 201);
  } catch (error) { exerciseWriteError(error); }
});
