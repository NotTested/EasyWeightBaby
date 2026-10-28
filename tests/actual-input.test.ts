import { test } from "node:test";
import assert from "node:assert/strict";
import { actualInputSchema, actualSetSchema } from "../src/lib/actual-input";
test("actual sets distinguish missing and zero without accepting invalid completion or fields", () => {
 const missing = { weightKg: null, dumbbellCount: null, reps: null, completed: false, side: "unspecified", kind: "working", actualRir: null };
 assert.deepEqual(actualSetSchema.parse(missing), missing);
 const zero = { weightKg: 0, dumbbellCount: 1, reps: 0, completed: true, side: "unspecified", kind: "working", actualRir: null };
 assert.deepEqual(actualSetSchema.parse(zero), zero);
 for (const invalid of [{ ...missing, completed: true, side: "unspecified", kind: "working", actualRir: null }, { ...zero, reps: -1 }, { ...zero, reps: 2.5 }, { ...zero, dumbbellCount: 0 }, { ...zero, weightKg: Infinity }, { ...zero, ownerId: "other" }])
  assert.equal(actualSetSchema.safeParse(invalid).success, false);
 assert.equal(actualInputSchema.safeParse({ version: 1, exercises: [], status: "completed" }).success, false);
});
