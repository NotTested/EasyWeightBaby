// Array order is the saved performance order, including separate left/right rows.
export function lastWorkingIndex(sets: ReadonlyArray<{ completed: boolean; kind: string }>) {
  return sets.findLastIndex(set => set.completed && set.kind === "working");
}
export const sideLabels = { unspecified: "미지정", both: "양측 동시", alternating_both: "양쪽 교대", left: "왼쪽", right: "오른쪽" };
export const kindLabels = { working: "본세트", warmup: "워밍업" };

// alternating_both stores repetitions per side, never the combined repetition count.
export function totalRepetitions(set: { side: string; reps: number | null }) {
  return set.reps === null ? null : set.reps * (set.side === "alternating_both" ? 2 : 1);
}
export function repetitionText(set: { side: string; reps: number | null }) {
  if (set.reps === null) return "반복 미입력";
  return set.side === "alternating_both" ? `좌우 각각 ${set.reps}회 (총 ${totalRepetitions(set)}회)` : `${set.reps}회`;
}
export function setVolumeKg(set: { side: string; reps: number | null; weightKg: number | null; dumbbellCount: number | null }, equipment: string) {
  const dumbbell = ["dumbbell", "dumbbell_bench"].includes(equipment);
  if (set.weightKg === null || set.reps === null || (dumbbell && set.dumbbellCount === null)) return null;
  // Alternating sides use one side's load at a time, including when two dumbbells are held.
  const multiplier = set.side === "alternating_both" ? 2 : dumbbell ? set.dumbbellCount! : 1;
  return set.weightKg * set.reps * multiplier;
}
