"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CardioEditor } from "./cardio-editor";
import { useWorkoutDraft } from "./use-workout-draft";
import { workoutText, type WorkoutModel } from "@/lib/workout-draft";
import { lastWorkingIndex, sideLabels, kindLabels } from "@/lib/set-performance";
type ActualSet = { side: string; kind: string; actualRir: number | null; weightKg: number | null; dumbbellCount: number | null; reps: number | null; completed: boolean };
import type { ExerciseItem } from "@/lib/exercise-input";
type Model = WorkoutModel;
const blank = (): ActualSet => ({ weightKg: null, dumbbellCount: null, reps: null, completed: false, side: "unspecified", kind: "working", actualRir: null });
export function ActualWorkout({ initial, ownerId }: { initial: Model; ownerId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(initial.status === "in_progress");
  const [model, setModel] = useState(initial), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const [q, setQ] = useState(""), [choices, setChoices] = useState<ExerciseItem[]>([]), [searchBusy, setSearchBusy] = useState(false);
  const inFlight = useRef(false);
  const [serverSnapshot, setServerSnapshot] = useState(initial);
  const [expired, setExpired] = useState(false);
  const draft = useWorkoutDraft(ownerId, model, dirty, busy);
  function downloadDraft() {
    const url = URL.createObjectURL(new Blob([workoutText(model)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "workout-draft.txt"; link.click(); URL.revokeObjectURL(url);
  }
  function patchSet(index: number, position: number, patch: Partial<ActualSet>) {
    change(index, model.exercises[index].sets.map((set, i) => i === position ? { ...set, ...patch } : set));
  }
  function change(index: number, sets: ActualSet[]) {
    setModel(m => ({ ...m, exercises: m.exercises.map((e, i) => i === index ? { ...e, sets } : e) })); setDirty(true); setMessage("");
  }
  async function search() {
    setSearchBusy(true);
    try { const r = await fetch(`/api/exercises?q=${encodeURIComponent(q)}`, { cache: "no-store" }); const data = await r.json();
      if (!r.ok) throw new Error(data.error); setChoices(data.items.filter((e: ExerciseItem) => e.measurement === "reps"));
    } catch { setMessage("종목을 검색하지 못했습니다."); } finally { setSearchBusy(false); }
  }
  async function save(intent: "save" | "complete" = "save") {
    if (inFlight.current || conflict || expired || draft.signedOut || draft.pending) return;
    if (!navigator.onLine) { draft.persist(); setMessage("오프라인입니다. 기기 초안 보관 상태를 확인하세요. 연결 후 저장 버튼을 눌러주세요."); return; }
    if (intent === "complete" && !window.confirm("현재 입력을 저장하고 운동을 종료할까요? 미완료 행은 수행 완료로 바뀌지 않습니다. 수행 기록이 없어도 종료됩니다.")) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const r = await fetch(`/api/sessions/${model.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: model.version, intent, actualNotes: model.actualNotes, cardio: model.cardio, exercises: model.exercises.map(e => ({ ...(e.id ? { id: e.id } : {}), exerciseId: e.exerciseId, sets: e.sets })) }) });
      if (r.status === 401) { setExpired(true); throw new Error("로그인이 만료됐습니다. 초안을 보관한 뒤 다시 로그인해주세요."); }
      const data = await r.json(); if (!r.ok) { if (r.status === 409) {
        setConflict(true);
        try { const latest = await fetch(`/api/sessions/${model.id}`, { cache: "no-store" }); if (latest.ok) setServerSnapshot((await latest.json()).item); } catch { /* Keep the last confirmed server snapshot. */ }
      } throw new Error(data.error); }
      draft.saved(); setModel(data.item); setDirty(false); setEditing(data.item.status === "in_progress");
      setMessage(intent === "complete" ? "운동을 종료하고 기록을 저장했습니다." : "실제 수행 기록을 저장했습니다.");
      router.refresh();
    } catch (e) { draft.persist(); setMessage(e instanceof Error && !(e instanceof TypeError) ? e.message : "서버 저장을 확인하지 못했습니다. 초안을 유지합니다. 연결 후 재시도해주세요."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (draft.signedOut) return <section className="card"><p role="alert">이 계정에서 로그아웃했습니다. 기기 초안을 정리하고 입력을 잠갔습니다.</p><a href="/login">로그인하기</a></section>;
  return <section className="card" data-unsaved-changes={dirty || busy ? "true" : "false"}>
    <h2>실제 수행 기록</h2>
    <p role="status">{draft.notice}</p>
    {draft.invalid && <button type="button" onClick={() => { if (window.confirm("읽을 수 없는 기기 초안을 삭제하고 자동 보관을 다시 켤까요?")) draft.discard(); }}>기기 초안 초기화</button>}
    {draft.pending && <aside><p>이 기기에 보관된 운동 초안이 있습니다. 서버 저장과 별개입니다.</p>
      <button type="button" onClick={() => { const pending = draft.pending!; setModel(pending); setDirty(true); setEditing(true); setConflict(pending.version !== initial.version || pending.status !== initial.status); draft.restore(); }}>기기 초안 복구</button>
      <button type="button" onClick={() => { if (window.confirm("보관된 기기 초안을 삭제할까요?")) draft.discard(); }}>기기 초안 삭제</button></aside>}
    {expired && <p role="alert">다시 로그인한 뒤 같은 운동을 열어 초안을 복구하세요. <a href="/login">로그인하기</a></p>}
    {conflict && <aside><p role="alert">서버 기록과 입력의 버전이 다릅니다. 자동 덮어쓰기는 하지 않습니다. 입력을 텍스트로 보관하고 서버 기록과 비교해주세요.</p><details><summary>최근 확인한 서버 기록 확인</summary><pre className="draft-text">{workoutText(serverSnapshot)}</pre></details></aside>}
    {dirty && <button type="button" onClick={downloadDraft}>입력 텍스트 내려받기</button>}
    <p className="help">목표를 실제 수행으로 자동 기록하지 않습니다. 빈칸은 미입력, 0은 실제 0입니다. 완료 체크는 세트 수행 여부입니다.</p>
    <p className="help">덤벨은 개당 kg와 사용한 덤벨 수를 기록하세요. 덤벨 수는 좌우 교대 횟수가 아닙니다. 맨몸의 외부 중량은 0kg입니다.</p>
    <p>진행 상태: {model.status === "completed" ? "완료" : "진행 중"}</p>
    {model.status === "completed" && !editing && <button type="button" onClick={() => setEditing(true)}>완료 기록 수정</button>}
    <fieldset disabled={busy || !editing || !draft.ready || !!draft.pending} className="actual-editor">
      {model.exercises.map((exercise, index) => {
        const last = lastWorkingIndex(exercise.sets);
        return <section key={exercise.id ?? `new-${index}`} className="actual-exercise" aria-label={`${exercise.exerciseName} 실제 기록`}>
        <h3>실제 · {exercise.exerciseName}</h3>
        {exercise.execution === "alternating" && <p className="help">좌우 교대 종목입니다. 왼쪽·오른쪽을 별도 행에 기록하고, 해당 측의 실제 반복만 입력하세요.</p>}
        <p className="help">각 행은 기록 순서입니다. 좌우 기록은 같은 세트라도 별도 행으로 추가하세요. 덤벨 수를 좌우 측수로 곱하지 않습니다.</p>
        <p className="help">RIR은 더 할 수 있었던 반복 수(0~10)입니다. 빈칸은 미입력이며 목표 RIR에서 채우지 않습니다.</p>
        <p>마지막 수행 본세트: {last < 0 ? "없음" : `${last + 1}행 · ${sideLabels[exercise.sets[last].side as keyof typeof sideLabels]}`}</p>
        <div><label htmlFor={`last-rir-${index}`}>마지막 본세트 RIR</label>
          <input id={`last-rir-${index}`} type="number" min="0" max="10" step="1" disabled={last < 0} value={last < 0 ? "" : exercise.sets[last].actualRir ?? ""}
            onChange={e => { if (last >= 0) patchSet(index, last, { actualRir: e.target.value === "" ? null : Number(e.target.value) }); }} />
          <p className="help">{last < 0 ? "수행 완료한 본세트가 없습니다." : exercise.sets[last].actualRir === null ? "마지막 본세트 RIR 미입력" : `마지막 본세트 RIR ${exercise.sets[last].actualRir}`}</p>
        </div>
        {exercise.sets.map((set, position) => <fieldset key={position} className="actual-set"><legend>{position + 1}행</legend>
          <div><label htmlFor={`side-${index}-${position}`}>수행 측</label><select id={`side-${index}-${position}`} value={set.side} onChange={e => patchSet(index, position, { side: e.target.value })}>
            {Object.entries(sideLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>
          <div><label htmlFor={`kind-${index}-${position}`}>세트 구분</label><select id={`kind-${index}-${position}`} value={set.kind} onChange={e => patchSet(index, position, { kind: e.target.value })}>
            {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>
          {(["weightKg", "dumbbellCount", "reps"] as const).filter(key => key !== "dumbbellCount" || ["dumbbell", "dumbbell_bench"].includes(exercise.equipment)).map(key => <div key={key}>
            <label htmlFor={`actual-${index}-${position}-${key}`}>{key === "weightKg" ? (["dumbbell", "dumbbell_bench"].includes(exercise.equipment) ? "개당 중량(kg)" : "외부 중량(kg)") : key === "reps" ? "반복수" : "덤벨 수"}</label>
            <input id={`actual-${index}-${position}-${key}`} type="number" min={key === "dumbbellCount" ? 1 : 0} max={key === "dumbbellCount" ? 2 : key === "reps" ? 1000 : 2000} step={key === "weightKg" ? "any" : 1} value={set[key] ?? ""}
              onChange={e => change(index, exercise.sets.map((s, i) => i === position ? { ...s, [key]: e.target.value === "" ? null : Number(e.target.value) } : s))} />
          </div>)}
          <div><label htmlFor={`rir-${index}-${position}`}>실제 RIR</label>
            <input id={`rir-${index}-${position}`} type="number" min="0" max="10" step="1" disabled={!set.completed} value={set.actualRir ?? ""}
              onChange={e => patchSet(index, position, { actualRir: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <label><input type="checkbox" checked={set.completed} onChange={e => {
            if (!e.target.checked && set.actualRir !== null && !window.confirm("완료를 해제하면 이 행의 실제 RIR도 지웁니다. 계속할까요?")) return;
            patchSet(index, position, { completed: e.target.checked, actualRir: e.target.checked ? set.actualRir : null });
          }} /> 수행 완료</label>
          <button type="button" className="secondary" onClick={() => { if (!set.completed || window.confirm("완료한 세트를 삭제할까요?")) change(index, exercise.sets.filter((_, i) => i !== position)); }}>세트 삭제</button>
        </fieldset>)}
        <button type="button" disabled={exercise.sets.length >= 30} onClick={() => change(index, [...exercise.sets, blank()])}>세트 추가</button>
      </section>; })}
      <div><label htmlFor="actual-search">추가할 종목 검색</label><input id="actual-search" value={q} onChange={e => setQ(e.target.value)} />
        <button type="button" disabled={searchBusy} onClick={search}>종목 검색</button></div>
      <ul>{choices.map(e => <li key={e.id}>{e.name} <button type="button" disabled={model.exercises.length >= 40} onClick={() => {
        setModel(m => ({ ...m, exercises: [...m.exercises, { exerciseId: e.id, exerciseName: e.name, equipment: e.equipment, execution: e.execution, sets: [] }] })); setDirty(true); setChoices([]); setMessage("");
      }}>종목 추가: {e.name}</button></li>)}</ul>
      <CardioEditor items={model.cardio} onChange={cardio => { setModel(m => ({ ...m, cardio })); setDirty(true); setMessage(""); }} />
      <div><label htmlFor="workout-notes">운동일지 메모</label><textarea id="workout-notes" maxLength={5000} value={model.actualNotes} onChange={e => { setModel(m => ({ ...m, actualNotes: e.target.value })); setDirty(true); setMessage(""); }} /></div>
      <button type="button" disabled={!dirty || busy || conflict || expired} onClick={() => save()}>{busy ? "저장 중…" : "수행 기록 저장"}</button>
      {model.status === "in_progress" && <button type="button" disabled={busy || conflict || expired} onClick={() => save("complete")}>저장하고 운동 종료</button>}
    </fieldset>
    <p role="status">{message}</p>
    {conflict && <button type="button" onClick={() => { if (window.confirm("현재 입력과 기기 초안을 버리고 서버 기록을 다시 불러올까요?")) { if (draft.abandon()) { setDirty(false); window.location.reload(); } } }}>서버 기록 다시 불러오기</button>}
    <p className="help">기기 초안은 이 브라우저에만 보관됩니다. 서버 저장과 운동 종료는 온라인에서 버튼을 눌러 확인하세요. 로그아웃하면 해당 계정의 초안은 삭제됩니다.</p>
  </section>;
}
