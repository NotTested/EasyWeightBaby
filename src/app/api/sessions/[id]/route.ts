import { verifyOrigin, readJson } from "@/lib/http";
import { actualInputSchema } from "@/lib/actual-input";
import { saveActualWorkout } from "@/lib/workouts";
import { currentUser, json, route } from "@/lib/http";
import { findWorkout } from "@/lib/workouts";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async req => {
    const user = await currentUser(req);
    const { id } = await context.params;
    const item = await findWorkout(id, user.id);
    return json({ item });
  })(request);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async req => {
    verifyOrigin(req);
    const user = await currentUser(req), { id } = await context.params;
    const input = actualInputSchema.parse(await readJson(req, 262144));
    return json({ item: await saveActualWorkout(id, user.id, input) });
  })(request);
}
