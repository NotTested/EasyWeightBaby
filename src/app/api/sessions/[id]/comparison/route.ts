import { currentUser, json, route } from "@/lib/http";
import { workoutComparison } from "@/lib/workout-comparison";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 return route(async req => { const user = await currentUser(req), { id } = await context.params; return json(await workoutComparison(user.id, id)); })(request);
}
