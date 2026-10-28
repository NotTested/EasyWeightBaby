import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
import { blankRoutine } from "../../src/lib/routine-input";

test("routine versions, snapshots and ownership", { timeout: 180000 }, async t => {
  const app = await exerciseApp(3194);
  try {
    const a = await app.user(), b = await app.user(), admin = await app.user("admin");
    async function exercise(cookie: string, name: string) {
      const result = await app.request("/api/exercises", "POST", { ...exerciseFixture(name), scope: "private" }, cookie);
      assert.equal(result.status, 201); return (await result.json()).item;
    }
    const first = await exercise(a.cookie, "Original " + randomUUID());
    const publicResponse = await app.request("/api/exercises", "POST", { ...exerciseFixture("Public " + randomUUID()), scope: "shared" }, admin.cookie);
    assert.equal(publicResponse.status, 201); const second = (await publicResponse.json()).item; app.sharedIds.push(second.id);
    const foreign = await exercise(b.cookie, "Foreign " + randomUUID());
    const plan = blankRoutine(); plan.name = "First weekly plan"; plan.days[0].rest = false;
    plan.days[0].items = [first, second].map(item => ({ exerciseId: item.id, sets: 3, minReps: 10, maxReps: 12, rir: null, benchAngle: "", notes: "" }));
    let id = "";
    await t.test("auth, Origin and private/inactive exercise validation", async () => {
      assert.equal((await app.request("/api/routines")).status, 401);
      assert.equal((await app.request("/api/routines", "POST", plan, a.cookie, "https://invalid.example")).status, 403);
      const invalid = structuredClone(plan); invalid.days[0].items[0].exerciseId = foreign.id;
      assert.equal((await app.request("/api/routines", "POST", invalid, a.cookie)).status, 400);
      const timed = await app.request("/api/exercises", "POST", { ...exerciseFixture("Timed " + randomUUID()), scope: "private", measurement: "duration" }, a.cookie);
      assert.equal(timed.status, 201); invalid.days[0].items[0].exerciseId = (await timed.json()).item.id;
      assert.equal((await app.request("/api/routines", "POST", invalid, a.cookie)).status, 400);
      assert.equal((await app.request("/api/routines", "POST", { ...plan, ownerId: b.id }, a.cookie)).status, 400);
      const created = await app.request("/api/routines", "POST", plan, a.cookie);
      assert.equal(created.status, 201); id = (await created.json()).item.id;
    });
    await t.test("admins and other members cannot read/edit/list another owner's routine", async () => {
      for (const cookie of [b.cookie, admin.cookie]) {
        assert.equal((await app.request(`/api/routines/${id}?version=1`, "GET", undefined, cookie)).status, 404);
        assert.equal((await app.request(`/api/routines/${id}`, "PATCH", { ...plan, version: 1 }, cookie)).status, 404);
        assert.equal((await (await app.request("/api/routines", "GET", undefined, cookie)).json()).items.some((item: { id: string }) => item.id === id), false);
      }
    });
    await t.test("concurrent saves produce one immutable version with reordered goals", async () => {
      const update = structuredClone(plan); update.name = "Second weekly plan";
      update.days[0].items.reverse(); update.days[0].items[0].sets = 4;
      const responses = await Promise.all([app.request(`/api/routines/${id}`, "PATCH", { ...update, version: 1 }, a.cookie),
        app.request(`/api/routines/${id}`, "PATCH", { ...update, version: 1 }, a.cookie)]);
      assert.deepEqual(responses.map(value => value.status).sort(), [200, 409]);
      const latest = await (await app.request(`/api/routines/${id}`, "GET", undefined, a.cookie)).json();
      assert.equal(latest.item.version, 2); assert.equal(latest.versions.length, 2);
      assert.equal(latest.item.days[0].items[0].exerciseId, second.id); assert.equal(latest.item.days[0].items[0].sets, 4);
      const old = await (await app.request(`/api/routines/${id}?version=1`, "GET", undefined, a.cookie)).json();
      assert.equal(old.item.name, plan.name); assert.equal(old.item.days[0].items[0].exerciseId, first.id);
      assert.equal(old.item.days[0].items[0].sets, 3); assert.equal(old.item.days[3].rest, true);
    });
    await t.test("renaming/deactivation keeps snapshots; invalid save leaves version unchanged", async () => {
      const modified = { ...exerciseFixture("Renamed " + randomUUID()), active: false, version: 1 };
      assert.equal((await app.request(`/api/exercises/${first.id}`, "PATCH", modified, a.cookie)).status, 200);
      const old = await (await app.request(`/api/routines/${id}?version=1`, "GET", undefined, a.cookie)).json();
      assert.equal(old.item.days[0].items[0].exerciseName, first.name);
      assert.equal((await app.request(`/api/routines/${id}`, "PATCH", { ...plan, version: 2 }, a.cookie)).status, 400);
      assert.equal(await app.db.routineVersion.count({ where: { routineId: id } }), 2);
    });
  } finally { await app.cleanup(); }
});
