import { db } from "@/lib/db";
import { ownerWhere } from "@/lib/access";
import { currentUser, HttpError, json, route } from "@/lib/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async req => {
    const user = await currentUser(req);
    const { id } = await context.params;
    const item = await db.workoutSession.findFirst({ where: ownerWhere(user.id, id) });
    if (!item) throw new HttpError(404, "운동일지를 찾을 수 없습니다.");
    return json({ item });
  })(request);
}
