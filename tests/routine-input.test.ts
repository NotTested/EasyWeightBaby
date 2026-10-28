import { test } from "node:test";
import assert from "node:assert/strict";
import { blankRoutine, routineFields } from "../src/lib/routine-input";
test("routine days, rest, bounds and ownership injection", () => {
  const plan = blankRoutine(); plan.name = "주간 계획";
  assert.equal(routineFields.safeParse(plan).success, true);
  assert.equal(routineFields.safeParse({ ...plan, ownerId: "other" }).success, false);
  assert.equal(routineFields.safeParse({ ...plan, days: plan.days.slice(1) }).success, false);
  assert.equal(routineFields.safeParse({ ...plan, days: plan.days.map(() => plan.days[0]) }).success, false);
  plan.days[0].rest = false;
  assert.equal(routineFields.safeParse(plan).success, false);
  plan.days[0].items = [{ exerciseId: "id", sets: 3, minReps: 12, maxReps: 10, rir: null, benchAngle: "", notes: "" }];
  assert.equal(routineFields.safeParse(plan).success, false);
  plan.days[0].items[0].maxReps = 15;
  assert.equal(routineFields.safeParse(plan).success, true);
  plan.days[0].rest = true;
  assert.equal(routineFields.safeParse(plan).success, false);
});
