export function importFixture() {
 return JSON.stringify({ summary: { schemaVersion: 1, mode: "preview_only", archiveSha256: "a".repeat(64), errors: 0 },
  records: { exercises: [{ notionId: "b".repeat(32), title: "Synthetic exercise", source: { csv: "synthetic.csv", row: 2 }, raw: { name: "Synthetic exercise" } }], exercise_clones: [], routines: [], sessions: [], logs: [] }, issues: [] });
}
