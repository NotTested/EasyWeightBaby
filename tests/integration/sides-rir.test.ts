import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
import { lastWorkingIndex } from "../../src/lib/set-performance";
test("independent sides and per-row RIR survive saves without multiplication, copying or fallback", { timeout: 180000 }, async () => {
 const app = await exerciseApp(3189);
 try {
  const a = await app.user(), other = await app.user("admin");
  const source = (await (await app.request("/api/exercises", "POST", { ...exerciseFixture(randomUUID()), execution: "alternating", scope: "private" }, a.cookie)).json()).item;
  let item = (await (await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "Sides RIR", localDate: "2026-10-28", source: null }, a.cookie)).json()).item;
  const left = { weightKg: 12.5, dumbbellCount: 1, reps: 10, completed: true, side: "left", kind: "working", actualRir: 0 };
  const right = { ...left, reps: 8, side: "right", actualRir: null };
  let sets = [left, right];
  async function save(expected = 200, cookie = a.cookie) {
   const body = { version: item.version, exercises: [{ ...(item.exercises[0] ? { id: item.exercises[0].id } : {}), exerciseId: source.id, sets }] };
   const response = await app.request(`/api/sessions/${item.id}`, "PATCH", body, cookie);
   assert.equal(response.status, expected);
   if (response.ok) item = (await response.json()).item;
  }
  await save();
  assert.deepEqual(item.exercises[0].sets, sets);
  assert.equal(item.exercises[0].sets.reduce((sum: number, s: typeof left) => sum + s.reps, 0), 18);
  assert.equal(lastWorkingIndex(item.exercises[0].sets), 1);
  assert.equal(item.exercises[0].sets[1].actualRir, null);
  sets = [{ ...left, side: "alternating_both", reps: 12, dumbbellCount: 2 }];
  await save();
  assert.equal(item.exercises[0].sets.length, 1);
  assert.equal(item.exercises[0].sets[0].side, "alternating_both");
  assert.equal(item.exercises[0].sets[0].reps, 12);
  const alternatingReload = (await (await app.request(`/api/sessions/${item.id}`, "GET", undefined, a.cookie)).json()).item;
  assert.deepEqual(alternatingReload.exercises[0].sets, sets);
  const savedRow = await app.db.workoutSet.findFirstOrThrow({ where: { sessionExerciseId: item.exercises[0].id } });
  await assert.rejects(app.db.workoutSet.update({ where: { id: savedRow.id }, data: { side: "left+right" } }));
  sets = [left, { ...right, actualRir: 2 }, { ...right, kind: "warmup", actualRir: 4 }];
  await save();
  assert.equal(lastWorkingIndex(item.exercises[0].sets), 1);
  assert.equal(item.exercises[0].sets[0].actualRir, 0);
  const reloaded = (await (await app.request(`/api/sessions/${item.id}`, "GET", undefined, a.cookie)).json()).item;
  assert.deepEqual(reloaded.exercises[0].sets, sets);
  await save(404, other.cookie);
  sets = [{ ...left, completed: false }]; await save(400);
  sets = [{ ...left, actualRir: 11 }]; await save(400);
  sets = [{ ...left, side: "invalid" }]; await save(400);
  assert.equal((await app.db.workoutSession.findUniqueOrThrow({ where: { id: item.id } })).version, item.version);
  sets = [left]; await save(); // deletion changes last row without moving RIR
  assert.equal(lastWorkingIndex(item.exercises[0].sets), 0);
  assert.equal(item.exercises[0].sets[0].actualRir, 0);
  sets = [{ ...left, completed: false, actualRir: null }]; await save();
  assert.equal(lastWorkingIndex(item.exercises[0].sets), -1);
 } finally { await app.cleanup(); }
});
