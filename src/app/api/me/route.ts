import { currentUser, json, route } from "@/lib/http";
export const GET = route(async request => {
  const user = await currentUser(request);
  return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, timeZone: user.timeZone } });
});
