import { test } from "node:test";
import assert from "node:assert/strict";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
import { historyFixture } from "../helpers/history-fixture";
test("history filters, stable pagination and previous completed actual comparison remain private", { timeout: 180000 }, async () => {
 const app = await exerciseApp(3184);
 try {
  const a = await app.user(), admin = await app.user("admin");
  const ex = (await (await app.request("/api/exercises", "POST", { ...exerciseFixture("Shared comparison exercise"), scope: "shared" }, admin.cookie)).json()).item; app.sharedIds.push(ex.id);
  const { current, previous } = await historyFixture(app.db, a.id, admin.id, ex.id);
  assert.equal((await app.request("/api/history")).status, 401);
  for (const path of ["/api/history?from=2026-02-30", "/api/history?from=2026-10-29&to=2026-10-01", "/api/history?status=all&status=completed", "/api/history?ownerId=other"]) assert.equal((await app.request(path, "GET", undefined, a.cookie)).status, 400);
  const response = await app.request("/api/history", "GET", undefined, a.cookie); assert.match(response.headers.get("cache-control")!, /no-store/);
  const first = await response.json(); assert.equal(first.items.length, 20); assert.ok(first.nextAfter);
  const second = await (await app.request(`/api/history?after=${first.nextAfter}`, "GET", undefined, a.cookie)).json();
  const ids = [...first.items, ...second.items].map((i: {id: string}) => i.id); assert.equal(new Set(ids).size, ids.length); assert.equal(second.nextAfter, null);
  assert.ok([...first.items, ...second.items].every((i: {ownerId?: string; recordKind: string}) => i.recordKind === "actual" && i.ownerId === undefined));
  const filtered = (await (await app.request("/api/history?from=2026-10-19&to=2026-10-20&status=completed", "GET", undefined, a.cookie)).json()).items;
  assert.deepEqual(filtered.map((i: {localDate: string}) => i.localDate), ["2026-10-20", "2026-10-19"]);
  assert.equal((await app.request(`/api/history?after=${current.id}`, "GET", undefined, admin.cookie)).status, 400);
  const route = `/api/sessions/${current.id}/comparison`;
  assert.equal((await app.request(route)).status, 401); assert.equal((await app.request(route, "GET", undefined, admin.cookie)).status, 404);
  const compareResponse = await app.request(route, "GET", undefined, a.cookie); assert.match(compareResponse.headers.get("cache-control")!, /no-store/);
  const comparison = await compareResponse.json(), item = comparison.items[0];
  assert.equal(item.previous.session.id, previous.id); assert.equal(item.previous.performance.lastWorkingRir, null); assert.equal(item.previous.performance.lastWorkingRow, 2);
  assert.equal(item.current.lastWorkingRir, 0); assert.equal(item.current.sets[0].reps, 0);
  assert.deepEqual(item.previous.performance.sets.slice(0, 2).map((s: {reps: number}) => s.reps), [10, 8]);
  assert.deepEqual(item.previous.differences, ["equipment", "benchAngle"]);
  const old = await (await app.request(`/api/sessions/${previous.id}/comparison`, "GET", undefined, a.cookie)).json(); assert.equal(old.items[0].previous, null);
  const testRecord = await app.db.workoutSession.findFirstOrThrow({ where: { ownerId: a.id, recordKind: "test" } });
  assert.equal((await app.request(`/api/sessions/${testRecord.id}/comparison`, "GET", undefined, a.cookie)).status, 404);
 } finally { await app.cleanup(); }
});
