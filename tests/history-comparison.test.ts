import { test } from "node:test";
import assert from "node:assert/strict";
import { historyQuerySchema, historyHref } from "../src/lib/history-input";
import { comparisonDifferences, performanceSummary } from "../src/lib/performance-comparison";
test("history filters require real dates, correct ranges and single supported values", () => {
 assert.equal(historyQuerySchema.safeParse({ from: "2026-02-30" }).success, false);
 assert.equal(historyQuerySchema.safeParse({ from: "2026-10-20", to: "2026-10-01" }).success, false);
 assert.equal(historyQuerySchema.safeParse({ status: ["all", "completed"] }).success, false);
 assert.equal(historyQuerySchema.safeParse(JSON.parse('{"__proto__":"invalid"}')).success, false);
 assert.equal(historyQuerySchema.safeParse({ ownerId: "other" }).success, false);
 const query = historyQuerySchema.parse({ from: "", to: "2026-10-29" });
 assert.equal(query.from, undefined); assert.equal(historyHref(query, "next"), "/history?to=2026-10-29&after=next");
});
test("comparison retains missing last RIR without substituting older zero or later warmup", () => {
 const set = { weightKg: 12, dumbbellCount: 1, reps: 10, actualRir: 0, side: "left", kind: "working", completed: true };
 const item = { exerciseName: "Name", equipment: "dumbbell", execution: "alternating", measurement: "reps", benchAngle: "", sets: [set, { ...set, side: "right", actualRir: null }, { ...set, kind: "warmup", actualRir: 5 }] };
 const summary = performanceSummary(item); assert.equal(summary.lastWorkingRow, 2); assert.equal(summary.lastWorkingRir, null);
 assert.equal(performanceSummary({ ...item, sets: [set] }).lastWorkingRir, 0);
 assert.deepEqual(comparisonDifferences(item, { ...item, exerciseName: "Renamed", equipment: "bodyweight", benchAngle: "30" }), ["equipment", "benchAngle"]);
});
