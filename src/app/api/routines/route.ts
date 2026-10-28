import { db } from "@/lib/db";
import { currentUser, json, readJson, route, verifyOrigin } from "@/lib/http";
import { routineFields } from "@/lib/routine-input";
import { saveRoutine } from "@/lib/routines";
export const GET = route(async request => {
  const user = await currentUser(request);
  const items = await db.routine.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, take: 101,
    select: { id: true, name: true, version: true } });
  return json({ items: items.slice(0, 100), hasMore: items.length > 100 });
});
export const POST = route(async request => {
  verifyOrigin(request); const user = await currentUser(request);
  return json({ item: await saveRoutine(user.id, routineFields.parse(await readJson(request, 262144))) }, 201);
});
