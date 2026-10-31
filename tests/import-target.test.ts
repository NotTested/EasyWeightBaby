import { reviewTemplate, validateReview } from "../src/lib/import-review";
import { test } from "node:test";
import assert from "node:assert/strict";
import { targetFixture } from "./helpers/target-fixture";
import { validateTargets } from "../src/lib/import-target";
test("explicit target mapping preserves identity, source slots, kind, zero and last RIR", () => {
 const { staging, manifest, plan, ids } = targetFixture();
 const validated = validateTargets(staging, manifest, plan);
 assert.equal(validated.volumeKg, 225); // 12.5kg × (left10 + right8); never multiply by two sides again
 const rejects = (modify: (value: typeof plan) => void) => { const changed = structuredClone(plan); modify(changed); assert.throws(() => validateTargets(staging, manifest, changed)); };
 rejects(p => { p.stagingHash = "f".repeat(64); });
 rejects(p => { p.exercises[0] = { sourceId: ids.exercise, action: "merge", intoSourceId: ids.clone, mappingNote: "cycle" }; });
 rejects(p => { p.logs[0].sets[1].side = "left"; });
 rejects(p => { p.logs[0].sets[1].actualRir = null; });
 rejects(p => { p.logs[0].sets[0].actualRir = 1; });
 rejects(p => { p.logs[1].sets[0].reps = null; });
 rejects(p => { const set = p.logs[1].sets[0]; p.logs[1].sets = [{ ...set, side: "left", reps: 10 }, { ...set, side: "right", reps: 10 }]; });
 rejects(p => { p.sessions[1].recordKind = "actual"; });
 rejects(p => { p.logs[0].exerciseSourceId = ids.exercise; });
 rejects(p => { p.logs[0].sets[0].sourceSlot = 2; });
 rejects(p => { p.routines[0].days.pop(); });
 rejects(p => { p.logs.pop(); });
 assert.throws(() => validateTargets(staging, manifest, { ...plan, ownerId: "other" }));
 const deferred = structuredClone(plan); deferred.logs[0].rirDecision = "defer"; deferred.logs[0].sets.forEach(s => { s.actualRir = null; });
 assert.equal(validateTargets(staging, manifest, deferred).volumeKg, 225);
});

test("test performance never contributes to actual volume and clone review requires a target", () => {
 const fixture = targetFixture();
 assert.throws(() => validateReview(fixture.staging, fixture.manifest)); // D2 default remains conservative
 const stage = JSON.parse(fixture.staging);
 stage.records.logs[1].setSlots[0].reps = "10"; stage.records.logs[1].setSlots[0].weightKg = "50";
 const staging = JSON.stringify(stage), template = reviewTemplate(staging);
 const manifest = { ...template, decisions: template.decisions.map(d => ({ ...d, decision: "reviewed" })) };
 const plan = structuredClone(fixture.plan); plan.stagingHash = template.stagingHash; plan.manifestHash = validateReview(staging, manifest, { allowCloneReview: true }).manifestHash;
 Object.assign(plan.logs[1].sets[0], { reps: 10, weightKg: 50, completed: true });
 assert.equal(validateTargets(staging, manifest, plan).volumeKg, 225);
 const deferred = structuredClone(manifest); deferred.decisions.find(d => d.externalId === fixture.ids.clone)!.decision = "defer";
 plan.manifestHash = validateReview(staging, deferred, { allowCloneReview: true }).manifestHash;
 assert.throws(() => validateTargets(staging, deferred, plan));
});
