import { test } from "node:test";
import assert from "node:assert/strict";
import { lastWorkingIndex } from "../src/lib/set-performance";
import { actualSetSchema } from "../src/lib/actual-input";
test("last RIR belongs to last performed working row, including missing RIR and warmup exclusion", () => {
 const first = { completed: true, kind: "working", actualRir: 0 };
 const later = { completed: true, kind: "working", actualRir: null };
 const warmup = { completed: true, kind: "warmup", actualRir: 3 };
 assert.equal(lastWorkingIndex([]), -1);
 assert.equal(lastWorkingIndex([first, { ...later, completed: false }]), 0);
 assert.equal(lastWorkingIndex([first, later, warmup]), 1);
 assert.equal(lastWorkingIndex([warmup]), -1);
 assert.equal(lastWorkingIndex([first, { ...later, kind: "warmup" }]), 0);
 const set = { weightKg: 12, dumbbellCount: 1, reps: 10, completed: true, side: "left", kind: "working", actualRir: 0 };
 assert.equal(actualSetSchema.parse(set).actualRir, 0);
 assert.equal(actualSetSchema.parse({ ...set, actualRir: null }).actualRir, null);
 for (const value of [-1, 11, 1.5]) assert.equal(actualSetSchema.safeParse({ ...set, actualRir: value }).success, false);
 for (const invalid of [{ ...set, completed: false }, { ...set, side: "left+right" }, { ...set, kind: "other" }])
  assert.equal(actualSetSchema.safeParse(invalid).success, false);
 const { actualRir, ...oldClient } = set;
 assert.equal(actualSetSchema.safeParse(oldClient).success, false); // cannot silently erase recorded RIR
});
