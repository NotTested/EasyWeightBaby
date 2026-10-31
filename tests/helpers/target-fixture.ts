import { reviewTemplate, validateReview } from "../../src/lib/import-review";
import { targetPlanSchema } from "../../src/lib/import-target";
export function targetFixture() {
 const [exercise, clone, routine, actual, log, test, testLog, planned] = Array.from({ length: 8 }, (_, i) => String(i + 1).repeat(32));
 const row = (notionId: string, title: string, n: number, extra = {}) => ({ notionId, title, source: { csv: "synthetic-target.csv", row: n }, raw: {}, ...extra });
 const session = (notionId: string, recordKind: string, status: string, n: number) => row(notionId, recordKind, n, { recordKind, status, localDate: "2026-10-20" });
 const stage = { summary: { schemaVersion: 1, mode: "preview_only", archiveSha256: "a".repeat(64), errors: 0 },
  records: { exercises: [row(exercise, "Synthetic unilateral", 2)], exercise_clones: [row(clone, "Clone", 3)],
   routines: [row(routine, "Monday", 4, { relations: { "종목": [clone] }, candidate: { weekday: 0 } })],
   sessions: [session(actual, "actual", "completed", 5), session(test, "test", "planned", 6), session(planned, "plan", "planned", 7)],
   logs: [row(log, "Actual log", 8, { recordKind: "actual", localDate: "2026-10-20", relations: { "세션": [actual], "종목": [clone] }, setSlots: [{ sourceSlot: 1, reps: "10", weightKg: "12.5" }], lastRir: "0", lastRirCandidateSlot: 1 }),
    row(testLog, "Test log", 9, { recordKind: "test", localDate: "2026-10-20", relations: { "세션": [test], "종목": [exercise] }, setSlots: [{ sourceSlot: 1, reps: "0", weightKg: "0" }], lastRir: null, lastRirCandidateSlot: 1 })],
  }, issues: [] };
 const staging = JSON.stringify(stage), template = reviewTemplate(staging);
 const manifest = { ...template, decisions: template.decisions.map(d => ({ ...d, decision: "reviewed" })) };
 const fields = { name: "Synthetic unilateral", aliases: ["Alias"], equipment: "dumbbell", category: "legs", execution: "alternating", measurement: "reps", benchAngle: "", notes: "Synthetic data", active: true };
 const set = { sourceSlot: 1, weightKg: 12.5, dumbbellCount: 1, reps: 10, side: "left", completed: true, kind: "working", actualRir: null };
 const plan = targetPlanSchema.parse({ format: 1, stagingHash: template.stagingHash, manifestHash: validateReview(staging, manifest, { allowCloneReview: true }).manifestHash,
  exercises: [{ sourceId: exercise, action: "create", fields, mappingNote: "Synthetic explicit fields" }, { sourceId: clone, action: "merge", intoSourceId: exercise, mappingNote: "Synthetic reviewed ID mapping" }],
  routines: [{ key: "week", name: "Synthetic weekly plan", mappingNote: "Explicit seven days; no inferred rest days", days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, rest: weekday !== 0, items: weekday === 0 ? [{ sourceId: routine, exerciseId: clone, sets: 3, minReps: 8, maxReps: 12, rir: null, benchAngle: "", notes: "" }] : [] })) }],
  sessions: [{ sourceId: actual, title: "Synthetic actual", localDate: "2026-10-20", recordKind: "actual", status: "completed", actualNotes: "Preserve actual notes", cardio: [{ activity: "Walking", durationMinutes: 20.5, distanceKm: null, intensity: "Zone? free text", notes: "", completed: true }], mappingNote: "Synthetic explicitly confirmed activity and completion" },
   { sourceId: test, title: "Synthetic test", localDate: "2026-10-20", recordKind: "test", status: "planned", actualNotes: "", cardio: [], mappingNote: "Synthetic test, never actual" },
   { sourceId: planned, title: "Synthetic plan", localDate: "2026-10-20", recordKind: "plan", status: "planned", actualNotes: "", cardio: [], mappingNote: "Synthetic plan, never actual" }],
  logs: [{ sourceId: log, sessionSourceId: actual, exerciseSourceId: clone, position: 0, snapshot: { name: "Historical unilateral label", equipment: "dumbbell", execution: "alternating", measurement: "reps" }, benchAngle: "", notes: "Confirmed left 10/right 8", rirDecision: "preserve-last", mappingNote: "Synthetic confirmed asymmetric reps; one dumbbell; RIR belongs to right final row", sets: [set, { ...set, side: "right", reps: 8, actualRir: 0 }] },
   { sourceId: testLog, sessionSourceId: test, exerciseSourceId: exercise, position: 0, snapshot: { name: "Historical unilateral label", equipment: "dumbbell", execution: "alternating", measurement: "reps" }, benchAngle: "", notes: "", rirDecision: "defer", mappingNote: "Preserve source zeros without assuming completion", sets: [{ ...set, weightKg: 0, reps: 0, completed: false, actualRir: null }] }],
 });
 return { staging, manifest, plan, ids: { exercise, clone, routine, actual, log, test, testLog, planned } };
}
