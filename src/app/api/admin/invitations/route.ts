import { db } from "@/lib/db";
import { currentUser, json, readJson, route, verifyOrigin } from "@/lib/http";
import { hashToken, newInvitationToken } from "@/lib/invitations";
import { invitationSchema } from "@/lib/validation";

export const GET = route(async request => {
  await currentUser(request, true);
  const items = await db.invitation.findMany({ orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, email: true, createdAt: true, expiresAt: true, usedAt: true, revokedAt: true } });
  return json({ items });
});
export const POST = route(async request => {
  verifyOrigin(request);
  const user = await currentUser(request, true);
  const data = invitationSchema.parse(await readJson(request));
  const token = newInvitationToken();
  const item = await db.invitation.create({ data: { tokenHash: hashToken(token), email: data.email,
    expiresAt: new Date(Date.now() + data.days * 86400000), createdBy: user.id },
    select: { id: true, expiresAt: true } });
  return json({ ...item, token }, 201);
});
