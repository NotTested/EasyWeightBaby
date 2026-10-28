import { db } from "@/lib/db";
import { currentUser, HttpError, json, readJson, route, verifyOrigin } from "@/lib/http";
import { routineUpdate } from "@/lib/routine-input";
import { routineDetail, saveRoutine } from "@/lib/routines";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return route(async req => {
    const user = await currentUser(req); const { id } = await context.params;
    const raw = new URL(req.url).searchParams.get("version");
    if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 2147483647)) throw new HttpError(400, "버전을 확인해주세요.");
    const item = await routineDetail(id, user.id, raw === null ? undefined : Number(raw));
    const versions = await db.routineVersion.findMany({ where: { routineId: id }, orderBy: { number: "desc" }, take: 50,
      select: { number: true, name: true, createdAt: true } });
    return json({ item, versions });
  })(request);
}
export async function PATCH(request: Request, context: Context) {
  return route(async req => {
    verifyOrigin(req); const user = await currentUser(req); const { id } = await context.params;
    const { version, ...plan } = routineUpdate.parse(await readJson(req, 262144));
    return json({ item: await saveRoutine(user.id, plan, { id, version }) });
  })(request);
}
