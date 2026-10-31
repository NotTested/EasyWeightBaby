import { currentUser, json, route } from "@/lib/http";
import { historyQuerySchema } from "@/lib/history-input";
import { workoutHistory } from "@/lib/workout-history";
export const GET = route(async request => {
 const user = await currentUser(request), params = new URL(request.url).searchParams;
 const values = Object.fromEntries([...new Set(params.keys())].map(key => [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)]));
 return json(await workoutHistory(user.id, historyQuerySchema.parse(values)));
});
