import { test } from "node:test";
import assert from "node:assert/strict";
import { cardioRecordSchema, actualInputSchema } from "../src/lib/actual-input";
test("cardio units, missing vs zero, free intensity and server-owned end state", () => {
 const blank = { activity: "걷기", durationMinutes: null, distanceKm: null, intensity: "Zone 2? 숨이 조금 참", notes: "원문\n보존", completed: false };
 assert.deepEqual(cardioRecordSchema.parse(blank), blank);
 assert.deepEqual(cardioRecordSchema.parse({ ...blank, durationMinutes: 0, distanceKm: 0, completed: true }), { ...blank, durationMinutes: 0, distanceKm: 0, completed: true });
 for (const invalid of [{ ...blank, completed: true }, { ...blank, activity: " " }, { ...blank, durationMinutes: -1 }, { ...blank, distanceKm: Infinity }, { ...blank, intensity: "a".repeat(301) }]) assert.equal(cardioRecordSchema.safeParse(invalid).success, false);
 const input = { version: 1, exercises: [] };
 for (const invalid of [{ ...input, endedAt: "2026-01-01" }, { ...input, status: "completed" }, { ...input, actualNotes: "a".repeat(5001) }, { ...input, intent: "reopen" }]) assert.equal(actualInputSchema.safeParse(invalid).success, false);
 assert.equal(actualInputSchema.parse(input).cardio, undefined); // old client cannot silently delete cardio
});
