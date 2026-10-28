// Array order is the saved performance order, including separate left/right rows.
export function lastWorkingIndex(sets: ReadonlyArray<{ completed: boolean; kind: string }>) {
  return sets.findLastIndex(set => set.completed && set.kind === "working");
}
export const sideLabels = { unspecified: "미지정", both: "양측 동시", left: "왼쪽", right: "오른쪽" };
export const kindLabels = { working: "본세트", warmup: "워밍업" };
