import { lastWorkingIndex } from "./set-performance";
export type Performance = { exerciseName: string; equipment: string; execution: string; measurement: string; benchAngle: string;
 sets: Array<{ weightKg: number | null; dumbbellCount: number | null; reps: number | null; actualRir: number | null; side: string; kind: string; completed: boolean }> };
export function performanceSummary(item: Performance) {
 const last = lastWorkingIndex(item.sets);
 return { exerciseName: item.exerciseName, equipment: item.equipment, execution: item.execution, measurement: item.measurement, benchAngle: item.benchAngle, sets: item.sets, lastWorkingRow: last < 0 ? null : last + 1, lastWorkingRir: last < 0 ? null : item.sets[last].actualRir };
}
export function comparisonDifferences(a: Performance, b: Performance) {
 return (["equipment", "execution", "measurement", "benchAngle"] as const).filter(key => a[key] !== b[key]);
}
export type ComparisonResult = { sessionId: string; version: number; localDate: string; items: Array<{ id: string; exerciseId: string; current: ReturnType<typeof performanceSummary>;
 previous: null | { session: { id: string; title: string; localDate: string; timeZone: string }; performance: ReturnType<typeof performanceSummary>; differences: Array<"equipment" | "execution" | "measurement" | "benchAngle"> } }> };
