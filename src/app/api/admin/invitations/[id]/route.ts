import { db } from "@/lib/db";
import { currentUser, HttpError, json, route, verifyOrigin } from "@/lib/http";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async req => {
    verifyOrigin(req); await currentUser(req, true);
    const { id } = await context.params;
    const result = await db.invitation.updateMany({ where: { id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new HttpError(404, "사용 가능한 초대를 찾을 수 없습니다.");
    return json({ success: true });
  })(request);
}
