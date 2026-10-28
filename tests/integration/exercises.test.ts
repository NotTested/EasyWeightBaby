import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";

test("Exercise HTTP ownership, search and update concurrency", { timeout: 180000 }, async t => {
  const app = await exerciseApp(3196);
  try {
    const admin = await app.user("admin"), a = await app.user(), b = await app.user();
    const name = "C1 " + randomUUID();
    const fields = exerciseFixture(name);
    let privateId = "", sharedId = "";
    await t.test("authentication, Origin, strict fields and shared-write permission", async () => {
      assert.equal((await app.request("/api/exercises")).status, 401);
      assert.equal((await app.request("/api/exercises", "POST", { ...fields, scope: "private" }, a.cookie, "https://invalid.example")).status, 403);
      assert.equal((await app.request("/api/exercises", "POST", { ...fields, scope: "shared" }, a.cookie)).status, 403);
      assert.equal((await app.request("/api/exercises", "POST", { ...fields, scope: "private", ownerId: b.id }, a.cookie)).status, 400);
    });
    await t.test("private and shared creation; case-normalized duplicate prevention", async () => {
      const own = await app.request("/api/exercises", "POST", { ...fields, scope: "private" }, a.cookie);
      assert.equal(own.status, 201); privateId = (await own.json()).item.id;
      const shared = await app.request("/api/exercises", "POST", { ...fields, scope: "shared" }, admin.cookie);
      assert.equal(shared.status, 201); sharedId = (await shared.json()).item.id; app.sharedIds.push(sharedId);
      assert.equal((await app.request("/api/exercises", "POST", { ...fields, name: name.toLowerCase(), scope: "private" }, a.cookie)).status, 409);
      assert.equal((await app.request("/api/exercises", "POST", { ...fields, scope: "shared" }, admin.cookie)).status, 409);
    });
    await t.test("other users and admins cannot read or modify private exercises", async () => {
      for (const cookie of [b.cookie, admin.cookie]) {
        assert.equal((await app.request(`/api/exercises/${privateId}`, "GET", undefined, cookie)).status, 404);
        assert.equal((await app.request(`/api/exercises/${privateId}`, "PATCH", { ...fields, version: 1 }, cookie)).status, 404);
        const list = await (await app.request(`/api/exercises?q=${encodeURIComponent(name)}`, "GET", undefined, cookie)).json();
        assert.deepEqual(list.items.map((item: { id: string }) => item.id), [sharedId]);
      }
      assert.equal((await app.request(`/api/exercises/${sharedId}`, "PATCH", { ...fields, version: 1 }, a.cookie)).status, 403);
      assert.equal((await app.request(`/api/exercises/${privateId}`, "PATCH", { ...fields, version: 1, scope: "shared" }, a.cookie)).status, 400);
    });
    await t.test("alias partial search and no-store result", async () => {
      const response = await app.request("/api/exercises?q=rd", "GET", undefined, a.cookie);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const list = await response.json();
      assert.ok(list.items.some((item: { id: string }) => item.id === privateId));
      assert.ok(list.items.some((item: { id: string }) => item.id === sharedId));
    });
    await t.test("only one concurrent edit succeeds; disable/reactivate retains identity", async () => {
      const changes = { ...fields, active: false, version: 1 };
      const results = await Promise.all([app.request(`/api/exercises/${privateId}`, "PATCH", changes, a.cookie),
        app.request(`/api/exercises/${privateId}`, "PATCH", changes, a.cookie)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const list = await (await app.request(`/api/exercises?q=${encodeURIComponent(name)}`, "GET", undefined, a.cookie)).json();
      assert.equal(list.items.some((item: { id: string }) => item.id === privateId), false);
      const all = await (await app.request(`/api/exercises?state=all&q=${encodeURIComponent(name)}`, "GET", undefined, a.cookie)).json();
      const saved = all.items.find((item: { id: string }) => item.id === privateId);
      assert.equal(saved.version, 2); assert.equal(saved.active, false);
      const active = await app.request(`/api/exercises/${privateId}`, "PATCH", { ...fields, version: 2 }, a.cookie);
      assert.equal(active.status, 200); assert.equal((await active.json()).item.id, privateId);
      assert.equal((await app.request(`/api/exercises/${privateId}`, "DELETE", undefined, a.cookie)).status, 405);
    });
    await t.test("admin can edit shared exercise without changing its scope", async () => {
      const result = await app.request(`/api/exercises/${sharedId}`, "PATCH", { ...fields, notes: "updated", version: 1 }, admin.cookie);
      assert.equal(result.status, 200); const item = (await result.json()).item;
      assert.equal(item.scope, "shared"); assert.equal(item.notes, "updated");
    });
  } finally { await app.cleanup(); }
});
