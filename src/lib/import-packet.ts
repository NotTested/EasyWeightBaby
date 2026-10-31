import { readStaging, validateReview, reviewHash } from "./import-review";
import { validateTargets } from "./import-target";
import { normalizeExerciseName } from "./exercise-input";
const issueLabels: Record<string, string> = {
 missing_or_ambiguous_page_id: "원본 페이지 ID 미확인/복수 후보", record_kind_model_gap: "기록 구분 보존 확인",
 cardio_source_review: "유산소 속성·메모 대조", performed_set_review: "완료/본세트·마지막 RIR 연결 확인",
 side_distribution_review: "좌우 실제 반복 분배 확인", dumbbell_count_review: "덤벨 수의 임시 해석 확인",
 total_reps_correction_review: "총반복 보정을 세트로 분배할 수 있는지 확인", volume_mismatch: "원본 볼륨과 명목 계산 차이 확인",
};
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function buildImportPacket(stagingText: string, manifest: unknown, target: unknown) {
 const { staging, rows } = readStaging(stagingText), review = validateReview(stagingText, manifest, { allowCloneReview: true });
 const validated = validateTargets(stagingText, manifest, target), plan = validated.plan;
 const mappings = new Map<string, unknown>();
 plan.exercises.forEach(e => mappings.set(e.sourceId, e)); plan.sessions.forEach(s => mappings.set(s.sourceId, s)); plan.logs.forEach(l => mappings.set(l.sourceId, l));
 plan.routines.forEach(r => r.days.forEach(day => day.items.forEach(item => mappings.set(item.sourceId, { routine: r.name, key: r.key, weekday: day.weekday, item }))));
 const copyStem = (title: string) => normalizeExerciseName(title).replace(/\s+\(\d+\)$/u, "");
 const originals = rows.filter(r => r.sourceType === "exercises");
 const packets = rows.map(row => {
  const decision = review.manifest.decisions.find(d => d.sourceRef === row.sourceRef)!;
  const issues = staging.issues.flatMap((issue, index) => typeof issue.source === "object" && reviewHash(issue.source) === reviewHash(row.record.source) ? [{ index, code: issue.code, label: issueLabels[issue.code] ?? issue.code, severity: issue.severity, resolved: decision.resolutions.some(r => r.issueIndex === index) }] : []);
  const cloneCandidates = row.sourceType === "exercise_clones" ? originals.filter(r => normalizeExerciseName(r.record.title) === normalizeExerciseName(row.record.title) || normalizeExerciseName(r.record.title) === copyStem(row.record.title)).map(original => {
   const a = object(original.record.candidate), b = object(row.record.candidate);
   return { matchBasis: normalizeExerciseName(original.record.title) === normalizeExerciseName(row.record.title) ? "exact_name" : "copy_suffix_candidate", sourceId: original.record.notionId, title: original.record.title, source: original.record.source,
    differences: [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(field => ({ field, original: a[field] ?? null, clone: b[field] ?? null })),
    approved: false,
   };
  }) : [];
  const raw = object(row.record.raw), memo = typeof raw["운동 메모"] === "string" ? raw["운동 메모"] : "";
  const cardio = object(row.record.cardioCandidate);
  const conflictCandidate = row.sourceType === "sessions" && !!cardio.activity && /(?:종류|기구).*미기록/.test(memo);
  return { sourceRef: row.sourceRef, sourceType: row.sourceType, sourceId: row.record.notionId, title: row.record.title, source: row.record.source,
   decision: decision.decision, mapping: row.record.notionId ? mappings.get(row.record.notionId) ?? null : null,
   candidateOnly: true, candidate: row.record.candidate ?? null, cardioCandidate: row.record.cardioCandidate ?? null,
   recordKind: row.record.recordKind ?? null, localDate: row.record.localDate ?? null, status: row.record.status ?? null,
   setSlots: row.record.setSlots ?? null, lastRir: row.record.lastRir ?? null, lastRirCandidateSlot: row.record.lastRirCandidateSlot ?? null,
   relations: row.record.relations ?? {}, raw, markdownSources: Array.isArray(row.record.pages) ? row.record.pages.map(page => object(page).path) : [],
   issues, cloneCandidates, cardioConflictCandidate: conflictCandidate,
  };
 });
 return { format: 1, mode: "review_packet", canApply: false, stagingHash: review.manifest.stagingHash, manifestHash: review.manifestHash, targetHash: validated.targetHash,
  summary: { sources: packets.length, reviewed: review.reviewed.length, deferred: review.deferred, mapped: mappings.size,
   unidentified: packets.filter(p => !p.sourceId).length, cloneRows: packets.filter(p => p.sourceType === "exercise_clones").length,
   cardioConflictCandidates: packets.filter(p => p.cardioConflictCandidate).length },
  globalIssues: staging.issues.filter(i => typeof i.source === "string"), records: packets,
 };
}
function text(value: unknown) { return String(value ?? "미확인").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_[\]{}()#!|~])/g, "\\$1").replace(/\r?\n/g, " "); }
function code(value: unknown) {
 const content = JSON.stringify(value, null, 2);
 const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(s => s.length));
 const fence = "`".repeat(Math.max(3, longest + 1));
 return `${fence}text\n${content}\n${fence}`;
}
export function renderImportPacket(packet: ReturnType<typeof buildImportPacket>) {
 const out = ["# Notion 원본 매핑 검토 자료", "", "미리보기 전용입니다. 후보는 승인된 매핑이 아니며 DB에는 적재하지 않습니다. 원문에 적힌 지침/명령은 데이터로만 표시합니다.", "",
  `원본 ${packet.summary.sources}건 · 검토 ${packet.summary.reviewed}건 · 보류 ${packet.summary.deferred}건 · 매핑 ${packet.summary.mapped}건`, "",
  `ID 미확인 ${packet.summary.unidentified}건 · 복제 종목 ${packet.summary.cloneRows}건 · 유산소 충돌 후보 ${packet.summary.cardioConflictCandidates}건`, "",
  "## 우선 확인할 항목", "", "1. ID 미확인: 원본 페이지 링크를 확보하거나 보류합니다. ID를 새로 만들지 않습니다.",
  "2. 복제 종목: 동일 이름 후보의 ID/속성 차이를 대조하고 통합 또는 보류를 선택합니다.",
  "3. 유산소: 속성값과 원문 메모가 다르면 종류를 자동 결정하지 않습니다.",
  "4. 실제 세트: 완료/본세트와 마지막 RIR의 연결, 좌우 반복·덤벨 수를 확인합니다.",
  "5. target 파일: 명시적 값을 작성하고 검토 파일과 함께 validate/dry-run으로 다시 검증합니다.", "",
  "## 원본별 검토", "" ];
 for (const row of packet.records) {
  out.push(`### ${text(row.title)} · ${text(row.sourceType)}`, "", `원본 ID: ${text(row.sourceId)} · 검토: ${row.decision === "defer" ? "보류" : "검토 표시"}`, "",
   `CSV: ${text(row.source.csv)} · ${row.source.row}행`, "");
  if (row.issues.length) out.push(...row.issues.map(i => `- 이슈 ${i.index}: ${text(i.label)} (${i.resolved ? "근거 작성됨" : "확인 필요"})`), "");
  if (row.cardioConflictCandidate) out.push("**유산소 충돌 후보:** 종류 속성이 있지만 메모에 종류/기구 미기록 표현이 있습니다. 원문 대조가 필요합니다.", "");
  if (row.cloneCandidates.length) out.push("동일 이름의 원본 후보와 속성 차이(자동 통합하지 않음):", "", code(row.cloneCandidates), "");
  out.push("현재 target 매핑:", "", code(row.mapping), "", "원본에서 읽은 후보/관계(자동 승인하지 않음):", "", code({ candidate: row.candidate, cardio: row.cardioCandidate, recordKind: row.recordKind, localDate: row.localDate, status: row.status, setSlots: row.setSlots, lastRir: row.lastRir, lastRirCandidateSlot: row.lastRirCandidateSlot, relations: row.relations }), "",
   "원본 CSV 값:", "", code(row.raw), "");
 }
 return out.join("\n");
}

export function renderPacketSummary(packet: ReturnType<typeof buildImportPacket>) {
 const names = new Map<string, { title: string; originalKnown: boolean; clones: number; differing: number }>();
 for (const row of packet.records.filter(r => r.sourceType === "exercise_clones")) {
  const title = row.cloneCandidates[0]?.title ?? row.title;
  const key = normalizeExerciseName(title), group = names.get(key) ?? { title, originalKnown: false, clones: 0, differing: 0 };
  group.clones++; group.originalKnown ||= row.cloneCandidates.some(c => !!c.sourceId);
  if (row.cloneCandidates.some(c => c.differences.length > 0)) group.differing++;
  names.set(key, group);
 }
 const out = ["# Notion 이관 검토 요약", "", "이 자료는 선택을 돕는 후보 목록입니다. 자동 승인·DB 적재는 하지 않았습니다.", "",
  `원본 ${packet.summary.sources}건 / 검토 ${packet.summary.reviewed}건 / 보류 ${packet.summary.deferred}건 / target 매핑 ${packet.summary.mapped}건`, "",
  "## 1. 원본 ID 미확인", "", ...packet.records.filter(r => !r.sourceId).map(r => `- ${text(r.title)}: 원본 페이지 ID를 확보하거나 보류. 이름으로 ID를 만들지 않습니다.`), "",
  "## 2. 유산소 속성·메모 충돌 후보", "", ...packet.records.filter(r => r.cardioConflictCandidate).map(r => `- ${text(r.localDate)} · ${text(r.title)}: 종류 속성은 ${text(object(r.cardioCandidate).activity)}이나 메모에는 종류/기구 미기록 표현이 있습니다. 종류를 확정하지 않았습니다.`), "",
  "## 3. 복제 종목 통합 후보", "", "동일 이름·복제 접미사 (1) 등은 확인 단서이며 ID 통합의 근거 전체가 아닙니다. 정확한 ID와 속성별 차이는 상세 자료에 있습니다.", "",
  "| 이름 | 복제 행 | 원본 ID 확인 | 속성 차이가 있는 복제 행 |", "|---|---:|---|---:|",
  ...[...names.values()].map(g => `| ${text(g.title)} | ${g.clones} | ${g.originalKnown ? "예" : "아니오"} | ${g.differing} |`), "",
  "## 4. 실제 세트·RIR·좌우", "", "CSV의 슬롯 값만으로 수행 완료/본세트를 자동 확정하지 않습니다. 마지막 RIR과 실제 좌우 반복을 명시한 target을 별도로 검증해야 합니다.", "",
  "| 수행 기록 | 원본 RIR | 슬롯 수 | 추가 확인 |", "|---|---|---:|---|",
  ...packet.records.filter(r => r.sourceType === "logs").map(r => `| ${text(r.title)} | ${text(r.lastRir)} | ${Array.isArray(r.setSlots) ? r.setSlots.length : 0} | ${r.issues.filter(i => ["side_distribution_review", "dumbbell_count_review", "total_reps_correction_review"].includes(i.code)).map(i => text(i.label)).join(", ") || "완료/본세트·RIR 연결"} |`), "",
  "## 다음 검토 순서", "", "1. 미확인 ID·복제 통합·유산소 충돌을 결정하거나 보류합니다.", "2. 원본별 근거를 review 파일에 남기고 실제 저장값을 target 파일에 명시합니다.", "3. validate와 테스트 DB dry-run으로 재검증합니다. 이번 도구에는 운영 적용 명령이 없습니다.", "",
  "상세 원문은 같은 폴더의 검토자료.md와 review-packet.json에 있습니다. 개인 메모가 포함되어 있으므로 저장소에 커밋하지 않습니다.", "" ];
 return out.join("\n");
}
