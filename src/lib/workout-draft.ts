import { z } from "zod";
const number = z.number().nullable();
const set = z.object({ side: z.string().max(30), kind: z.string().max(30), actualRir: number, weightKg: number, dumbbellCount: number, reps: number, completed: z.boolean() });
export const draftModelSchema = z.object({
 id: z.string().min(1).max(100), version: z.number().int().positive(), status: z.enum(["in_progress", "completed"]), actualNotes: z.string().max(5000),
 cardio: z.array(z.object({ activity: z.string().max(80), durationMinutes: number, distanceKm: number, intensity: z.string().max(300), notes: z.string().max(1000), completed: z.boolean() })).max(20),
 exercises: z.array(z.object({ id: z.string().max(100).optional(), exerciseId: z.string().min(1).max(100), exerciseName: z.string().max(80), equipment: z.string().max(40), execution: z.string().max(40), sets: z.array(set).max(30) })).max(40),
});
export type WorkoutModel = Omit<z.infer<typeof draftModelSchema>, "status"> & { status: string };
export const draftPrefix = "member-workout-draft:v1:";
export const logoutKey = (owner: string) => `member-workout-logout:${encodeURIComponent(owner)}`;
export const draftAccountPrefix = (owner: string) => `${draftPrefix}${encodeURIComponent(owner)}:`;
export const draftKey = (owner: string, id: string) => draftAccountPrefix(owner) + encodeURIComponent(id);
export const startRequestKey = (ownerId: string) => `member-workout-start:v1:${encodeURIComponent(ownerId)}`;
const envelope = z.object({ format: z.literal(1), ownerId: z.string(), savedAt: z.number().int().positive(), model: draftModelSchema });
export function parseDraft(raw: string, ownerId: string, sessionId: string) {
 if (raw.length > 1024 * 1024) throw new Error("Draft too large");
 const value = envelope.parse(JSON.parse(raw));
 if (value.ownerId !== ownerId || value.model.id !== sessionId) throw new Error("Wrong draft owner/session");
 return value;
}
export function encodeDraft(ownerId: string, model: WorkoutModel) {
 return JSON.stringify(envelope.parse({ format: 1, ownerId, savedAt: Date.now(), model }));
}
export function clearAccountDrafts(ownerId: string) {
 let cleared = true;
 try {
  const prefix = draftAccountPrefix(ownerId);
  for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
  localStorage.removeItem(startRequestKey(ownerId));
  localStorage.setItem(logoutKey(ownerId), crypto.randomUUID());
 } catch { cleared = false; }
 finally {
  window.dispatchEvent(new CustomEvent("workout-logout", { detail: ownerId }));
  try { const channel = new BroadcastChannel("member-workout-logout"); channel.postMessage(ownerId); channel.close(); } catch { /* Storage event is the fallback. */ }
 }
 return cleared;
}
export function workoutText(model: WorkoutModel) {
 return [model.status === "completed" ? "기록 상태: 완료" : model.status === "planned" ? "기록 상태: 계획" : "기록 상태: 진행 중", `운동일지 메모: ${model.actualNotes}`,
 ...model.exercises.flatMap(e => [e.exerciseName, ...e.sets.map((s, i) => `${i + 1}행: ${{ unspecified: "측 미지정", both: "양측 동시", left: "왼쪽", right: "오른쪽" }[s.side] ?? s.side} / ${s.kind === "warmup" ? "워밍업" : "본세트"}, ${s.weightKg ?? "미입력"}kg × ${s.dumbbellCount ?? "-"}개, ${s.reps ?? "미입력"}회, RIR ${s.actualRir ?? "미입력"}, ${s.completed ? "수행" : "미완료"}`)]),
 ...model.cardio.map(c => `${c.activity}: ${c.durationMinutes ?? "미입력"}분, ${c.distanceKm ?? "미입력"}km, ${c.intensity}, ${c.notes}, ${c.completed ? "수행" : "미완료"}`)].join("\n");
}
