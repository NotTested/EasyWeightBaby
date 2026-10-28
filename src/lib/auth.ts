import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import { appUrl } from "./config";

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || process.env.BETTER_AUTH_SECRET.startsWith("replace-")) {
  throw new Error("BETTER_AUTH_SECRET에 32자 이상의 임의 비밀값을 설정하세요.");
}

export const auth = betterAuth({
  appName: "회원님?",
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [appUrl()],
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
  user: { additionalFields: {
    role: { type: "string", defaultValue: "member", input: false },
    timeZone: { type: "string", defaultValue: "Asia/Seoul", input: false }
  } },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30,
    customRules: { "/sign-in/email": { window: 60, max: 10 } } },
});
