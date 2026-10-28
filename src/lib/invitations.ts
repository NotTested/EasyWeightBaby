import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "./db";
import { HttpError } from "./http";
import { registrationSchema } from "./validation";

export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export function newInvitationToken() { return randomBytes(32).toString("hex"); }

export async function registerInvited(input: unknown) {
  const data = registrationSchema.parse(input);
  const tokenHash = hashToken(data.token);
  const invitation = await db.invitation.findUnique({ where: { tokenHash } });
  const invalid = () => new HttpError(400, "초대가 유효하지 않거나 사용할 수 없습니다.");
  if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= new Date()
    || (invitation.email && invitation.email !== data.email)) throw invalid();
  const password = await hashPassword(data.password);
  try {
    return await db.$transaction(async tx => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalid();
      const id = randomUUID();
      await tx.user.create({ data: {
        id, name: data.name, email: data.email, role: "member",
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password } },
      } });
      return { id };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw invalid();
    throw error;
  }
}

export async function registrationLimit() {
  const bucket = Math.floor(Date.now() / 60000);
  const value = await db.requestBucket.upsert({
    where: { key: `registration:${bucket}` },
    create: { key: `registration:${bucket}`, expiresAt: new Date((bucket + 2) * 60000) },
    update: { count: { increment: 1 } },
  });
  if (value.count > 30) throw new HttpError(429, "가입 요청이 많습니다. 잠시 후 다시 시도하세요.");
  await db.requestBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
