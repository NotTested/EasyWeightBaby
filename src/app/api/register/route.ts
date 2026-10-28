import { json, readJson, route, verifyOrigin } from "@/lib/http";
import { registerInvited, registrationLimit } from "@/lib/invitations";
export const POST = route(async request => {
  verifyOrigin(request);
  await registrationLimit();
  await registerInvited(await readJson(request));
  return json({ success: true }, 201);
});
