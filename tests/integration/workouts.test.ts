import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
import { blankRoutine } from "../../src/lib/routine-input";

test("workout start, retry ownership and stable goal snapshots", { timeout: 180000 }, async t => {
  const app = await exerciseApp(3192);
  try {
    const a = await app.user(), b = await app.user(), admin = await app.user("admin");
    const empty = { requestId: randomUUID(), title: "Empty start", localDate: "2026-10-18", source: null };
    let emptyId = "", routineId = "", exerciseId = "", plannedId = "";
    const fields = exerciseFixture("Snapshot exercise " + randomUUID());
    const plan = blankRoutine(); plan.name = "Original routine";
    await t.test("auth, Origin, dates and server-owned state", async () => {
      assert.equal((await app.request("/api/sessions", "POST", empty)).status, 401);
      assert.equal((await app.request("/api/sessions", "POST", empty, a.cookie, "https://invalid.example")).status, 403);
      assert.equal((await app.request("/api/sessions", "POST", { ...empty, localDate: "2026-02-30" }, a.cookie)).status, 400);
      assert.equal((await app.request("/api/sessions", "POST", { ...empty, ownerId: b.id }, a.cookie)).status, 400);
    });
    await t.test("concurrent retries create exactly one empty session; payload conflict is 409", async () => {
      const results = await Promise.all([app.request("/api/sessions", "POST", empty, a.cookie), app.request("/api/sessions", "POST", empty, a.cookie)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 201]);
      const bodies = await Promise.all(results.map(result => result.json())); emptyId = bodies[0].item.id;
      assert.equal(bodies[1].item.id, emptyId); assert.equal(bodies[0].item.status, "in_progress");
      assert.equal(bodies[0].item.localDate, empty.localDate); assert.equal(bodies[0].item.timeZone, "Asia/Seoul");
      assert.ok(bodies[0].item.startedAt); assert.deepEqual(bodies[0].item.exercises, []);
      assert.equal(await app.db.workoutSession.count({ where: { ownerId: a.id } }), 1);
      assert.equal((await app.request("/api/sessions", "POST", { ...empty, title: "different" }, a.cookie)).status, 409);
      assert.equal((await app.request("/api/sessions", "POST", { ...empty, requestId: randomUUID() }, a.cookie)).status, 201);
    });
    await t.test("goal import uses an explicit owned routine version and chosen day", async () => {
      const exercise = await app.request("/api/exercises", "POST", { ...fields, scope: "private" }, a.cookie);
      exerciseId = (await exercise.json()).item.id;
      plan.days[0] = { weekday: 0, rest: false, items: [{ exerciseId, sets: 3, minReps: 10, maxReps: 12, rir: 0, benchAngle: "30°", notes: "goal only" }] };
      const routine = await app.request("/api/routines", "POST", plan, a.cookie); assert.equal(routine.status, 201); routineId = (await routine.json()).item.id;
      const request = { ...empty, requestId: randomUUID(), source: { routineId, version: 1, weekday: 0 } };
      assert.equal((await app.request("/api/sessions", "POST", request, b.cookie)).status, 404);
      assert.equal((await app.request("/api/sessions", "POST", { ...request, source: { ...request.source, weekday: 1 } }, a.cookie)).status, 400);
      const started = await app.request("/api/sessions", "POST", request, a.cookie); assert.equal(started.status, 201);
      const item = (await started.json()).item; plannedId = item.id;
      assert.equal(item.localDate, "2026-10-18"); assert.equal(item.routineWeekday, 0); assert.equal(item.routineNumber, 1);
      assert.equal(item.exercises[0].goalSets, 3); assert.equal(item.exercises[0].goalRir, 0);
      assert.equal(item.exercises[0].exerciseName, fields.name);
      assert.equal(item.startHash, undefined); assert.equal(item.startKey, undefined);
      assert.equal((await app.request(`/api/routines/${routineId}`, "PATCH", { ...plan, name: "New routine", version: 1 }, a.cookie)).status, 200);
      assert.equal((await app.request(`/api/exercises/${exerciseId}`, "PATCH", { ...fields, name: "Renamed", active: false, version: 1 }, a.cookie)).status, 200);
      const saved = (await (await app.request(`/api/sessions/${plannedId}`, "GET", undefined, a.cookie)).json()).item;
      assert.equal(saved.routineName, "Original routine"); assert.equal(saved.routineNumber, 1); assert.equal(saved.exercises[0].exerciseName, fields.name);
      assert.equal((await app.request("/api/sessions", "POST", { ...request, requestId: randomUUID() }, a.cookie)).status, 400);
      assert.equal((await app.request("/api/sessions", "POST", request, a.cookie)).status, 200);
    });
    await t.test("re-entry and list remain private even from admins", async () => {
      for (const cookie of [b.cookie, admin.cookie]) {
        assert.equal((await app.request(`/api/sessions/${plannedId}`, "GET", undefined, cookie)).status, 404);
        const list = await (await app.request("/api/sessions?status=in_progress", "GET", undefined, cookie)).json();
        assert.equal(list.items.some((item: { id: string }) => item.id === plannedId || item.id === emptyId), false);
      }
      assert.equal((await app.request(`/api/sessions/${plannedId}`, "GET", undefined, a.cookie)).status, 200);
    });
  } finally { await app.cleanup(); }
});
