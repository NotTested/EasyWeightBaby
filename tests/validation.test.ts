import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationSchema, invitationSchema } from "../src/lib/validation";

test("가입 입력에서 역할 주입·잘못된 초대·짧은 비밀번호를 거부한다", () => {
  const input = { name: "회원", email: "TEST@example.com", password: "long-password-123", token: "a".repeat(64) };
  assert.equal(registrationSchema.parse(input).email, "test@example.com");
  assert.equal(registrationSchema.safeParse({ ...input, role: "admin" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, token: "bad" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, password: "short" }).success, false);
  assert.equal(invitationSchema.safeParse({ days: 365 }).success, false);
});
