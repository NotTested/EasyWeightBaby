import { test } from "node:test";
import assert from "node:assert/strict";
import { actualSetSchema } from "../src/lib/actual-input";
import { totalRepetitions, repetitionText, setVolumeKg, lastWorkingIndex } from "../src/lib/set-performance";
import { encodeDraft, parseDraft, workoutText, type WorkoutModel } from "../src/lib/workout-draft";
const set = { side: "alternating_both", kind: "working", weightKg: 10, dumbbellCount: 2, reps: 12, completed: true, actualRir: 0 };
test("alternating row preserves per-side reps, zero and missing values", () => {
 assert.equal(actualSetSchema.parse(set).reps, 12);
 assert.equal(totalRepetitions(set), 24); assert.equal(repetitionText(set), "좌우 각각 12회 (총 24회)");
 assert.equal(totalRepetitions({ ...set, reps: 0 }), 0);
 assert.equal(totalRepetitions({ ...set, reps: null }), null);
 assert.equal(repetitionText({ ...set, reps: null }), "반복 미입력");
 for (const side of ["unspecified", "both", "left", "right"]) assert.equal(totalRepetitions({ ...set, side }), 12);
});
test("alternating volume equals explicit left and right rows without multiplying held dumbbells twice", () => {
 for (const dumbbellCount of [1,2]) assert.equal(setVolumeKg({ ...set, dumbbellCount }, "dumbbell"), 240);
 assert.equal(setVolumeKg(set, "dumbbell_bench"), 240);
 assert.equal(setVolumeKg({ ...set, side: "left", dumbbellCount: 1 }, "dumbbell")! + setVolumeKg({ ...set, side: "right", dumbbellCount: 1 }, "dumbbell")!, 240);
 assert.equal(setVolumeKg({ ...set, side: "both" }, "dumbbell"), 240);
 assert.equal(setVolumeKg({ ...set, reps: 0 }, "dumbbell"), 0);
 assert.equal(setVolumeKg({ ...set, reps: null }, "dumbbell"), null);
 assert.equal(setVolumeKg({ ...set, dumbbellCount: null }, "dumbbell"), null);
 assert.equal(setVolumeKg({ ...set, weightKg: 0, dumbbellCount: null }, "bodyweight"), 0);
});
test("draft roundtrip and readonly export retain per-side meaning and common RIR", () => {
 const model: WorkoutModel = { id: "synthetic", version: 1, status: "in_progress", actualNotes: "", cardio: [], exercises: [{ exerciseId: "exercise", exerciseName: "Synthetic", equipment: "dumbbell", execution: "alternating", sets: [set] }] };
 const restored = parseDraft(encodeDraft("owner", model), "owner", "synthetic").model;
 assert.deepEqual(restored.exercises[0].sets, [set]);
 assert.match(workoutText(restored), /양쪽 교대.*좌우 각각 12회 \(총 24회\)/);
 assert.equal(lastWorkingIndex([set, { ...set, kind: "warmup" }]), 0);
 const missingRir = { ...set, actualRir: null }; assert.equal(lastWorkingIndex([missingRir]), 0);
});
