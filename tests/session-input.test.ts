import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDateSchema, startSessionSchema } from "../src/lib/session-input";
test("real calendar dates and strict workout-start payload", () => {
  assert.equal(localDateSchema.safeParse("2024-02-29").success, true);
  for (const date of ["2026-02-29", "2026-04-31", "2026-1-2", "invalid"]) assert.equal(localDateSchema.safeParse(date).success, false);
  const input = { requestId: randomUUID(), title: "운동", localDate: "2026-10-28", source: null };
  assert.equal(startSessionSchema.safeParse(input).success, true);
  for (const extra of [{ ownerId: "other" }, { status: "completed" }, { timeZone: "UTC" }, { startedAt: "2026-01-01" }])
    assert.equal(startSessionSchema.safeParse({ ...input, ...extra }).success, false);
});
