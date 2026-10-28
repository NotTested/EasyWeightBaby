import { test } from "node:test";
import assert from "node:assert/strict";
import { createExerciseSchema, updateExerciseSchema, normalizeExerciseName } from "../src/lib/exercise-input";

test("exercise normalization, aliases and forbidden ownership fields", () => {
  assert.equal(normalizeExerciseName("  ＲＤＬ  로우  "), "rdl 로우");
  const input = { name: "루마니안 데드리프트", aliases: ["RDL"], scope: "private", equipment: "dumbbell", category: "legs",
    execution: "bilateral", measurement: "reps", benchAngle: "", notes: "", active: true };
  assert.equal(createExerciseSchema.safeParse(input).success, true);
  for (const changes of [{ ownerId: "other" }, { scopeKey: "shared" }, { aliases: ["RDL", "ｒｄｌ"] }, { name: " " },
    { aliases: Array.from({ length: 13 }, (_, i) => String(i)) }, { aliases: ["a,b"] }, { equipment: "unsupported" }]) {
    assert.equal(createExerciseSchema.safeParse({ ...input, ...changes }).success, false);
  }
  const { scope: _, ...fields } = input;
  assert.equal(updateExerciseSchema.safeParse({ ...fields, version: 1 }).success, true);
  assert.equal(updateExerciseSchema.safeParse({ ...fields, version: 0 }).success, false);
  assert.equal(updateExerciseSchema.safeParse({ ...fields, version: 1, scope: "shared" }).success, false);
});
