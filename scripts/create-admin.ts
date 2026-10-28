import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "../src/lib/prisma-client";
import { emailSchema } from "../src/lib/validation";

const db = createPrismaClient(process.env.DATABASE_URL);
async function hiddenPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("비밀번호를 보호하려면 대화형 터미널에서 실행하세요.");
  process.stdout.write(label);
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => { process.stdin.off("data", read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); };
    const read = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") { cleanup(); reject(new Error("취소했습니다.")); return; }
        if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", read);
  });
}
async function main() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const name = (await prompt.question("관리자 이름: ")).trim();
  const email = emailSchema.parse((await prompt.question("관리자 이메일: ")).trim());
  prompt.close();
  const password = await hiddenPassword("비밀번호 (12~128자, 화면에 표시되지 않음): ");
  const confirmation = await hiddenPassword("비밀번호 다시 입력: ");
  if (!name || name.length > 40 || password.length < 12 || password.length > 128 || password !== confirmation) throw new Error("이름 또는 비밀번호 조건을 확인하세요.");
  const passwordHash = await hashPassword(password);
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72631005)`;
    if (await tx.user.count({ where: { role: "admin" } })) throw new Error("초기 관리자가 이미 있습니다. 이 명령은 최초 설정 전용입니다.");
    const id = randomUUID();
    await tx.user.create({ data: { id, name, email, role: "admin", accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: passwordHash } } } });
  });
  console.log("초기 관리자 생성 완료. 앱에서 로그인한 뒤 초대를 발급하세요.");
}
main().catch(error => { console.error(error instanceof Error && !error.message.includes("prisma") ? error.message : "관리자 생성 실패. DB 연결과 중복 이메일을 확인하세요."); process.exitCode = 1; }).finally(() => db.$disconnect());
