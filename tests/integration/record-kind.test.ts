import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp } from "../helpers/exercise-app";
test("non-actual workouts stay separate, immutable and owner private", { timeout: 180000 }, async () => {
 const app = await exerciseApp(3185);
 try {
  const a = await app.user(), admin = await app.user("admin");
  const actual = (await (await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "Actual", localDate: "2026-10-29", source: null }, a.cookie)).json()).item;
  assert.equal(actual.recordKind, "actual");
  const testTitle = "Test " + randomUUID(), planTitle = "Plan " + randomUUID();
  const nonActual = await Promise.all([app.db.workoutSession.create({ data: { ownerId: a.id, title: testTitle, localDate: "2026-10-29", recordKind: "test" } }), app.db.workoutSession.create({ data: { ownerId: a.id, title: planTitle, localDate: "2026-10-29", recordKind: "plan", status: "planned" } })]);
  const defaults = (await (await app.request("/api/sessions", "GET", undefined, a.cookie)).json()).items;
  assert.deepEqual(defaults.map((i: {id: string}) => i.id), [actual.id]);
  for (const item of nonActual) {
   const list = (await (await app.request(`/api/sessions?recordKind=${item.recordKind}`, "GET", undefined, a.cookie)).json()).items;
   assert.equal(list[0].id, item.id);
   assert.equal((await app.request(`/api/sessions/${item.id}`, "GET", undefined, admin.cookie)).status, 404);
   assert.equal((await app.request(`/api/sessions/${item.id}`, "PATCH", { version: 1, exercises: [] }, a.cookie)).status, 409);
   const detail = await app.request(`/sessions/${item.id}`, "GET", undefined, a.cookie);
   assert.ok((await detail.text()).includes("읽기 전용"));
  }
  const history = await (await app.request("/history", "GET", undefined, a.cookie)).text();
  assert.equal(history.includes(testTitle), false); assert.equal(history.includes(planTitle), false);
  assert.equal((await app.request("/api/sessions?recordKind=unknown", "GET", undefined, a.cookie)).status, 400);
  assert.equal((await app.request(`/api/sessions/${actual.id}`, "PATCH", { version: 1, exercises: [], recordKind: "test" }, a.cookie)).status, 400);
 } finally { await app.cleanup(); }
});
