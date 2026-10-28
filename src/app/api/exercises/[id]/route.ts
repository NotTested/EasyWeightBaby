import { db } from "@/lib/db";
import { currentUser, HttpError, json, readJson, route, verifyOrigin } from "@/lib/http";
import { updateExerciseSchema } from "@/lib/exercise-input";
import { exerciseItem, exerciseWriteError, updateExercise, visibleExercises } from "@/lib/exercises";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return route(async req => {
    const user = await currentUser(req);
    const { id } = await context.params;
    const item = await db.exercise.findFirst({ where: { id, ...visibleExercises(user) } });
    if (!item) throw new HttpError(404, "종목을 찾을 수 없습니다.");
    return json({ item: exerciseItem(item, user) });
  })(request);
}
export async function PATCH(request: Request, context: Context) {
  return route(async req => {
    verifyOrigin(req);
    const user = await currentUser(req);
    const { id } = await context.params;
    const input = updateExerciseSchema.parse(await readJson(req));
    try { return json({ item: await updateExercise(id, user, input) }); }
    catch (error) { exerciseWriteError(error); }
  })(request);
}
