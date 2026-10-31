import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeDraft, parseDraft, draftKey, workoutText } from "../src/lib/workout-draft";
test("local draft validates owner, session and format while retaining unfinished performance", () => {
 const model = { id: "session", version: 2, status: "in_progress", actualNotes: "초안", cardio: [{ activity: "", durationMinutes: null, distanceKm: 0, intensity: "Zone?", notes: "", completed: false }],
 exercises: [{ exerciseId: "exercise", exerciseName: "종목", equipment: "dumbbell", execution: "alternating", sets: [{ weightKg: 0, dumbbellCount: 1, reps: 0, side: "left", kind: "working", completed: false, actualRir: null }] }] };
 const raw = encodeDraft("owner", model);
 assert.deepEqual(parseDraft(raw, "owner", "session").model, model);
 assert.throws(() => parseDraft(raw, "other", "session")); assert.throws(() => parseDraft(raw, "owner", "other"));
 assert.throws(() => parseDraft("{invalid", "owner", "session")); assert.throws(() => parseDraft(raw.replace('"format":1', '"format":2'), "owner", "session"));
 assert.notEqual(draftKey("a:b", "c"), draftKey("a", "b:c"));
 assert.ok(workoutText(model).includes("왼쪽")); assert.ok(workoutText(model).includes("RIR 미입력"));
});
