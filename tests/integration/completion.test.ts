import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
test("cardio, notes, atomic partial completion, retry, ownership and completed edits", { timeout: 180000 }, async () => {
 const app = await exerciseApp(3187);
 try {
  const a = await app.user(), other = await app.user("admin");
  const source = (await (await app.request("/api/exercises", "POST", { ...exerciseFixture(randomUUID()), scope: "private" }, a.cookie)).json()).item;
  let item = (await (await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "Complete " + randomUUID(), localDate: "2026-10-28", source: null }, a.cookie)).json()).item;
  const cardio = [{ activity: "걷기", durationMinutes: 20.5, distanceKm: null, intensity: "Zone 2? 원문 유지", notes: "경사\n조금", completed: true }, { activity: "달리기", durationMinutes: 0, distanceKm: 0, intensity: "", notes: "", completed: false }];
  const sets = [{ weightKg: 12, dumbbellCount: 2, reps: 10, completed: true, side: "both", kind: "working", actualRir: 0 }, { weightKg: null, dumbbellCount: null, reps: null, completed: false, side: "unspecified", kind: "working", actualRir: null }];
  const original = { version: item.version, intent: "complete", actualNotes: "실제 메모\n목표와 분리", cardio, exercises: [{ exerciseId: source.id, sets }] };
  const path = `/api/sessions/${item.id}`;
  assert.equal((await app.request(path, "PATCH", original)).status, 401);
  assert.equal((await app.request(path, "PATCH", original, other.cookie)).status, 404);
  assert.equal((await app.request(path, "PATCH", original, a.cookie, "https://bad.invalid")).status, 403);
  assert.equal((await app.request(path, "PATCH", { ...original, cardio: [{ ...cardio[0], durationMinutes: null }] }, a.cookie)).status, 400);
  // Validation inside the transaction also rolls back the status transition.
  assert.equal((await app.request(path, "PATCH", { ...original, exercises: [{ exerciseId: "unavailable", sets }] }, a.cookie)).status, 400);
  let stored = (await (await app.request(path, "GET", undefined, a.cookie)).json()).item;
  assert.equal(stored.status, "in_progress"); assert.equal(stored.endedAt, null); assert.equal(stored.version, 1); assert.equal(stored.actualNotes, "");
  const results = await Promise.all([app.request(path, "PATCH", original, a.cookie), app.request(path, "PATCH", original, a.cookie)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  item = (await (await app.request(path, "GET", undefined, a.cookie)).json()).item;
  assert.equal(item.status, "completed"); assert.ok(item.endedAt); const ended = item.endedAt;
  assert.deepEqual(item.cardio, cardio); assert.deepEqual(item.exercises[0].sets, sets); assert.equal(item.actualNotes, original.actualNotes);
  assert.equal((await app.request(path, "PATCH", original, a.cookie)).status, 409);
  const ongoing = (await (await app.request("/api/sessions?status=in_progress", "GET", undefined, a.cookie)).json()).items;
  assert.equal(ongoing.some((e: {id: string}) => e.id === item.id), false);
  const completed = (await (await app.request("/api/sessions?status=completed", "GET", undefined, a.cookie)).json()).items;
  assert.equal(completed.some((e: {id: string}) => e.id === item.id), true);
  assert.equal((await app.request(path, "GET", undefined, other.cookie)).status, 404);
  let input = { version: item.version, exercises: [{ id: item.exercises[0].id, exerciseId: source.id, sets }] };
  // C5 clients omit new fields; preserving them is safer than applying empty defaults.
  const oldClient = await app.request(path, "PATCH", input, a.cookie); assert.equal(oldClient.status, 200); item = (await oldClient.json()).item;
  assert.deepEqual(item.cardio, cardio); assert.equal(item.actualNotes, original.actualNotes); assert.equal(item.endedAt, ended);
  input.version = item.version;
  const edits = await app.request(path, "PATCH", { ...input, actualNotes: "수정", cardio: [] }, a.cookie); assert.equal(edits.status, 200); item = (await edits.json()).item;
  assert.equal(item.status, "completed"); assert.equal(item.endedAt, ended); assert.deepEqual(item.cardio, []); assert.equal(item.actualNotes, "수정");
  const legacy = await app.db.workoutSession.create({ data: { ownerId: a.id, title: "Legacy", localDate: "2026-10-20", status: "completed" } });
  const legacyEdit = await app.request(`/api/sessions/${legacy.id}`, "PATCH", { version: legacy.version, exercises: [], actualNotes: "기존 완료 기록 수정" }, a.cookie);
  assert.equal(legacyEdit.status, 200); assert.equal((await legacyEdit.json()).item.endedAt, null);
  const mine = await app.request("/history", "GET", undefined, a.cookie), theirs = await app.request("/history", "GET", undefined, other.cookie);
  assert.ok((await mine.text()).includes(item.title)); assert.equal((await theirs.text()).includes(item.title), false);
 } finally { await app.cleanup(); }
});
