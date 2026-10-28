"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { categoryLabels, equipmentLabels, executionLabels, measurementLabels, type ExerciseFields, type ExerciseItem } from "@/lib/exercise-input";

const empty: ExerciseFields = { name: "", aliases: [], equipment: "dumbbell", category: "other", execution: "bilateral", measurement: "reps", benchAngle: "", notes: "", active: true };
function Options({ labels }: { labels: Record<string, string> }) {
  return Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}
export function ExerciseManager({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("active");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ExerciseItem | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  async function load(q = query, filter = state) {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/exercises?${new URLSearchParams({ q, state: filter })}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "종목 목록을 불러오지 못했습니다.");
      if (current === generation.current) { setItems(data.items); setHasMore(data.hasMore); }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "연결하지 못했습니다."); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { void load("", "active"); return () => { generation.current++; }; }, []);
  function edit(item: ExerciseItem | null) {
    if (dirty && !window.confirm("입력 중인 내용을 버리고 다른 종목을 열까요?")) return;
    setSelected(item); setDirty(false); setError(""); setNotice("");
    setEditorEpoch(value => value + 1);
    // Remount key resets uncontrolled inputs; focus the new editor after render.
    requestAnimationFrame(() => nameInput.current?.focus());
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    const fields = { name: data.get("name"), aliases: String(data.get("aliases") ?? "").split(",").map(value => value.trim()).filter(Boolean),
      equipment: data.get("equipment"), category: data.get("category"), execution: data.get("execution"), measurement: data.get("measurement"),
      benchAngle: data.get("benchAngle"), notes: data.get("notes"), active: data.get("active") === "on" };
    try {
      const response = await fetch(selected ? `/api/exercises/${selected.id}` : "/api/exercises", {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, ...(selected ? { version: selected.version } : { scope: data.get("scope") }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.fields?.map((field: { message: string }) => field.message).join(" ") || result.error || "저장하지 못했습니다. 입력을 확인해주세요.");
      setSelected(result.item); setDirty(false); setNotice(result.item.active ? "종목을 저장했습니다." : "종목을 비활성화했습니다. 전체 목록에서 다시 활성화할 수 있어요.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다. 입력은 그대로 남아 있어요."); }
    finally { setSaving(false); }
  }
  const current = selected ?? empty;
  return <div className="exercise-grid">
    <section className="card"><div className="row exercise-list-heading"><h2>종목 찾기</h2>
      <button className="button secondary small" onClick={() => edit(null)} disabled={saving}>종목 추가</button></div>
      <div className="exercise-search"><label>종목명·별칭 검색<input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void load(); }} /></label>
        <label>표시 범위<select aria-label="표시 범위" value={state} onChange={event => { setState(event.target.value); void load(query, event.target.value); }}><option value="active">활성 종목</option><option value="all">비활성 포함</option></select></label>
        <button className="button secondary" onClick={() => void load()} disabled={loading}>검색·새로고침</button>
      </div>
      <p className="help">공용 종목과 내 종목을 함께 검색합니다. 같은 별칭을 가진 종목은 모두 표시됩니다.</p>
      <div role="status" aria-live="polite">{loading ? "불러오는 중…" : `${items.length}개 종목`}{hasMore && " · 결과가 많습니다. 검색어를 좁혀주세요."}</div>
      {!loading && items.length === 0 && <p className="muted">조건에 맞는 종목이 없습니다. 새 종목을 등록하거나 비활성 종목을 확인해주세요.</p>}
      <ul className="list exercise-list">{items.map(item => <li key={item.id}>
        <div className="row"><h3>{item.name}</h3><span className="badge">{item.scope === "shared" ? "공용" : "내 종목"}{!item.active && " · 비활성"}</span></div>
        <p className="help">{equipmentLabels[item.equipment]} · {categoryLabels[item.category]} · {executionLabels[item.execution]} · {measurementLabels[item.measurement]}</p>
        {item.aliases.length > 0 && <p className="fine">별칭: {item.aliases.join(", ")}</p>}
        {item.benchAngle && <p className="fine">벤치 각도: {item.benchAngle}</p>}
        {item.notes && <p className="exercise-notes">{item.notes}</p>}
        {item.canEdit ? <button className="button secondary small" onClick={() => edit(item)} disabled={saving || loading}>편집</button> : <p className="help">공용 종목은 관리자만 수정할 수 있어요.</p>}
      </li>)}</ul>
    </section>
    <section className="card exercise-editor" data-unsaved-changes={dirty || saving ? "true" : undefined}>
      <div className="row"><h2>{selected ? "종목 편집" : "새 종목"}</h2>{selected && <button className="button secondary small" onClick={() => edit(null)} disabled={saving}>새 종목 등록</button>}</div>
      <form key={`${selected ? `${selected.id}:${selected.version}` : "new"}:${editorEpoch}`} data-update-safe={!dirty && !saving ? "true" : undefined} onSubmit={save} onChange={() => setDirty(true)}>
        <fieldset disabled={saving}>
          <label>종목명<input ref={nameInput} name="name" defaultValue={current.name} required maxLength={80} /></label>
          <label>별칭<input name="aliases" defaultValue={current.aliases.join(", ")} maxLength={982} /><span className="help">쉼표로 구분해 최대 12개, 각각 80자까지 입력하세요.</span></label>
          {!selected && <label>공개 범위<select aria-label="공개 범위" name="scope" defaultValue="private"><option value="private">내 종목</option>{admin && <option value="shared">공용 종목</option>}</select></label>}
          {selected && <p className="help">{selected.scope === "shared" ? "공용 종목: 변경 사항은 모든 사용자에게 표시됩니다." : "내 종목: 다른 회원에게 보이지 않습니다."} 공개 범위는 변경할 수 없습니다.</p>}
          <div className="exercise-fields"><label>도구<select aria-label="도구" name="equipment" defaultValue={current.equipment}><Options labels={equipmentLabels} /></select></label>
            <label>운동 부위<select aria-label="운동 부위" name="category" defaultValue={current.category}><Options labels={categoryLabels} /></select></label>
            <label>수행 방식<select aria-label="수행 방식" name="execution" defaultValue={current.execution}><Options labels={executionLabels} /></select></label>
            <label>측정 방식<select aria-label="측정 방식" name="measurement" defaultValue={current.measurement}><Options labels={measurementLabels} /></select></label></div>
          <label>벤치 각도<input name="benchAngle" defaultValue={current.benchAngle} maxLength={40} placeholder="예: 30–45°" /></label>
          <label>메모<textarea aria-label="메모" name="notes" defaultValue={current.notes} maxLength={2000} rows={4} /></label>
          <label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={current.active} />활성 종목</label>
          <p className="help">비활성화해도 종목은 삭제되지 않습니다.</p>
          <button className="button" type="submit">{saving ? "저장 중…" : "종목 저장"}</button>
        </fieldset>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="success">{notice}</p>}
    </section>
  </div>;
}
