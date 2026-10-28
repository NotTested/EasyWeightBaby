import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
test("actual sets retain null, zero and variable weights, guard privacy and conflicting saves", { timeout: 180000 }, async () => {
 const app = await exerciseApp(3190);
 try {
  const a = await app.user(), b = await app.user("admin");
  const source = (await (await app.request("/api/exercises", "POST", { ...exerciseFixture(randomUUID()), scope: "private" }, a.cookie)).json()).item;
  let item = (await (await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "Actuals", localDate: "2026-10-28", source: null }, a.cookie)).json()).item;
  const sets = [{ weightKg: null, dumbbellCount: null, reps: null, completed: false, side: "unspecified", kind: "working", actualRir: null }, { weightKg: 0, dumbbellCount: 1, reps: 0, completed: true, side: "unspecified", kind: "working", actualRir: null }, { weightKg: 12.5, dumbbellCount: 2, reps: 10, completed: true, side: "unspecified", kind: "working", actualRir: null }];
  const input = { version: item.version, exercises: [{ exerciseId: source.id, sets }] };
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", input)).status, 401);
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", input, b.cookie)).status, 404);
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", input, a.cookie, "https://bad.invalid")).status, 403);
  const result = await app.request(`/api/sessions/${item.id}`, "PATCH", input, a.cookie); assert.equal(result.status, 200); item = (await result.json()).item;
  assert.deepEqual(item.exercises[0].sets, sets); assert.equal(item.exercises[0].goalSets, null);
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", input, a.cookie)).status, 409); // retry cannot duplicate added exercises
  const saved = (await (await app.request(`/api/sessions/${item.id}`, "GET", undefined, a.cookie)).json()).item;
  assert.deepEqual(saved.exercises[0].sets, sets);
  const valid = { version: item.version, exercises: [{ id: item.exercises[0].id, exerciseId: source.id, sets: sets.slice(1) }] };
  const responses = await Promise.all([app.request(`/api/sessions/${item.id}`, "PATCH", valid, a.cookie), app.request(`/api/sessions/${item.id}`, "PATCH", valid, a.cookie)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const latest = (await (await app.request(`/api/sessions/${item.id}`, "GET", undefined, a.cookie)).json()).item;
  const payload = { ...valid, version: latest.version };
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", { ...payload, exercises: [{ ...valid.exercises[0], sets: [{ ...sets[0], completed: true, side: "unspecified", kind: "working", actualRir: null }] }] }, a.cookie)).status, 400);
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", { ...payload, exercises: [{ ...valid.exercises[0], sets: [{ ...sets[2], dumbbellCount: null }] }] }, a.cookie)).status, 400);
  const otherSource = (await (await app.request("/api/exercises", "POST", { ...exerciseFixture(randomUUID()), scope: "private" }, b.cookie)).json()).item;
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", { ...payload, exercises: [...valid.exercises, { exerciseId: otherSource.id, sets: [] }] }, a.cookie)).status, 400);
  assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", { ...payload, exercises: [] }, a.cookie)).status, 400);
  await app.db.exercise.update({ where: { id: source.id }, data: { active: false, name: "renamed" } });
  const afterDisable = await app.request(`/api/sessions/${item.id}`, "PATCH", payload, a.cookie);
  assert.equal(afterDisable.status, 200);
  const after = (await afterDisable.json()).item;
  assert.equal(after.exercises[0].exerciseName, source.name);
  latest.version = after.version;
  assert.deepEqual((await app.db.workoutSession.findUniqueOrThrow({ where: { id: item.id } })).version, latest.version);
 } finally { await app.cleanup(); }
});
