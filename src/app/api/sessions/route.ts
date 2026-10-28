import { db } from "@/lib/db";
import { ownerWhere } from "@/lib/access";
import { currentUser, json, route } from "@/lib/http";
export const GET = route(async request => {
  const user = await currentUser(request);
  const items = await db.workoutSession.findMany({ where: ownerWhere(user.id), orderBy: { localDate: "desc" }, take: 100 });
  return json({ items });
});
