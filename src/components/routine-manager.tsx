"use client";
import { useEffect, useState, type FormEvent } from "react";
import { blankRoutine, weekdays, type RoutineDetail, type RoutinePlan } from "@/lib/routine-input";
import type { ExerciseItem } from "@/lib/exercise-input";

function editablePlan(item: RoutineDetail): RoutinePlan {
  return { name: item.name, days: item.days.map(day => ({ weekday: day.weekday, rest: day.rest,
    items: day.items.map(({ exerciseId, sets, minReps, maxReps, rir, benchAngle, notes }) => ({ exerciseId, sets, minReps, maxReps, rir, benchAngle, notes })) })) };
}
export function RoutineManager() {
  const [list, setList] = useState<Array<{ id: string; name: string; version: number }>>([]);
  const [choices, setChoices] = useState<Record<string, ExerciseItem>>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RoutineDetail | null>(null);
  const [versions, setVersions] = useState<Array<{ number: number; name: string }>>([]);
  const [plan, setPlan] = useState<RoutinePlan>(blankRoutine);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const historical = !!selected && selected.version !== selected.currentVersion;
  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options); const data = await response.json();
    if (!response.ok) throw new Error(data.fields?.map((field: { message: string }) => field.message).join(" ") || data.error || "처리하지 못했습니다.");
    return data;
  }
  async function refreshList() {
    const data = await request("/api/routines"); setList(data.items);
    if (data.hasMore) setNotice("최근 루틴 100개를 표시합니다.");
  }
  async function findExercises(q = query) {
    const data = await request(`/api/exercises?q=${encodeURIComponent(q)}`);
    setChoices(current => ({ ...current, ...Object.fromEntries(data.items.filter((item: ExerciseItem) => item.measurement === "reps").map((item: ExerciseItem) => [item.id, item])) }));
  }
  useEffect(() => { Promise.all([refreshList(), findExercises("")]).catch(e => setError(e.message)).finally(() => setBusy(false)); }, []);
  function canDiscard() { return !dirty || window.confirm("저장하지 않은 루틴 변경을 버릴까요?"); }
  async function open(id?: string, version?: number) {
    if (!canDiscard()) return;
    setError(""); setNotice("");
    if (!id) { setSelected(null); setVersions([]); setPlan(blankRoutine()); setDirty(false); return; }
    setBusy(true);
    try {
      const data = await request(`/api/routines/${id}${version ? `?version=${version}` : ""}`);
      setSelected(data.item); setPlan(editablePlan(data.item)); setVersions(data.versions); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : "루틴을 열지 못했습니다."); }
    finally { setBusy(false); }
  }
  function changeDay(weekday: number, change: (day: RoutinePlan["days"][number]) => RoutinePlan["days"][number]) {
    setDirty(true); setPlan(current => ({ ...current, days: current.days.map(day => day.weekday === weekday ? change(day) : day) }));
  }
  function changeItem(day: number, index: number, values: Partial<RoutinePlan["days"][number]["items"][number]>) {
    changeDay(day, current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...values } : item) }));
  }
  function move(day: number, index: number, direction: number) {
    changeDay(day, current => { const items = [...current.items]; [items[index], items[index + direction]] = [items[index + direction], items[index]]; return { ...current, items }; });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (historical) return;
    setBusy(true); setError(""); setNotice("");
    let saved = false;
    try {
      const data = await request(selected ? `/api/routines/${selected.id}` : "/api/routines", {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plan, ...(selected ? { version: selected.version } : {}) }),
      });
      setSelected(data.item); setPlan(editablePlan(data.item)); setDirty(false);
      saved = true; setNotice(`버전 ${data.item.version}을 저장했습니다.`);
      const history = await request(`/api/routines/${data.item.id}?version=${data.item.version}`); setVersions(history.versions);
      await refreshList();
    } catch (e) { setError(saved ? "저장은 완료됐지만 목록을 갱신하지 못했습니다. 최신 버전을 다시 열어주세요." : e instanceof Error ? e.message : "저장하지 못했습니다. 입력은 유지됩니다."); }
    finally { setBusy(false); }
  }
  const options = Object.values(choices);
  return <div className="routine-workspace">
    <section className="card"><div className="row"><h2>내 루틴</h2><button className="button secondary" disabled={busy} onClick={() => void open()}>새 루틴</button></div>
      <ul className="list">{list.map(item => <li key={item.id}><button className="link-button" disabled={busy} onClick={() => void open(item.id)}>{item.name} · v{item.version}</button></li>)}</ul>
      {!list.length && !busy && <p>아직 저장한 루틴이 없습니다.</p>}
    </section>
    <section className="card" data-unsaved-changes={dirty || busy ? "true" : undefined}>
      <h2>{selected ? `루틴 버전 ${selected.version}` : "새 주간 루틴"}</h2>
      {selected && <div className="routine-tools"><label>저장 버전<select aria-label="저장 버전" value={selected.version} disabled={busy} onChange={event => void open(selected.id, Number(event.target.value))}>
        {versions.map(version => <option key={version.number} value={version.number}>v{version.number} · {version.name}</option>)}</select></label>
        <button className="button secondary" disabled={busy} onClick={() => void open(selected.id)}>최신 버전 열기</button></div>}
      {historical && <p role="status">이전 버전은 읽기 전용입니다. 편집하려면 최신 버전을 열어주세요.</p>}
      <div className="routine-tools"><label>종목 검색<input maxLength={80} value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button className="button secondary" disabled={busy} onClick={() => { setBusy(true); findExercises().catch(e => setError(e.message)).finally(() => setBusy(false)); }}>종목 불러오기</button></div>
      <p className="help">활성 공용·내 종목 중 반복수로 측정하는 종목을 사용합니다. 검색 결과는 종목 선택 목록에 추가됩니다. 비활성 종목은 새 버전 저장 전 교체해주세요.</p>
      <form onSubmit={save} method="post" data-update-safe={!dirty && !busy ? "true" : undefined}>
        <fieldset className="routine-editor" disabled={busy || historical}>
          <label>루틴 이름<input required maxLength={80} value={plan.name} onChange={event => { setDirty(true); setPlan({ ...plan, name: event.target.value }); }} /></label>
          {plan.days.map(day => <fieldset key={day.weekday} className="routine-day" aria-label={`${weekdays[day.weekday]}요일`}>
            <legend>{weekdays[day.weekday]}요일</legend><label className="checkbox-label"><input type="checkbox" checked={day.rest} onChange={event => {
              if (event.target.checked && day.items.length && !window.confirm("이 요일의 종목을 지우고 휴식일로 바꿀까요?")) return;
              changeDay(day.weekday, value => ({ ...value, rest: event.target.checked, items: event.target.checked ? [] : value.items }));
            }} />휴식일</label>
            {!day.rest && <><div className="stack">{day.items.map((item, index) => {
              const snapshot = selected?.days.flatMap(value => value.items).find(value => value.exerciseId === item.exerciseId);
              return <div className="routine-item" key={index}><p>{index + 1}번째 운동</p>
                <label>운동 종목<select aria-label="운동 종목" required value={item.exerciseId} onChange={event => changeItem(day.weekday, index, { exerciseId: event.target.value })}>
                  <option value="">종목 선택</option>{options.filter(value => !historical || value.id !== item.exerciseId).map(value => <option key={value.id} value={value.id}>{value.name} · {value.scope === "shared" ? "공용" : "내 종목"}</option>)}
                  {item.exerciseId && (historical || !choices[item.exerciseId]) && <option value={item.exerciseId}>{snapshot?.exerciseName ?? "선택한 종목 (다시 검색 필요)"}</option>}
                </select></label>
                <div className="exercise-fields">{([['sets', '목표 세트', 20], ['minReps', '최소 반복', 1000], ['maxReps', '최대 반복', 1000]] as const).map(([key, label, max]) =>
                  <label key={key}>{label}<input aria-label={label} type="number" required min={1} max={max} value={item[key]} onChange={event => changeItem(day.weekday, index, { [key]: Number(event.target.value) })} /></label>)}
                  <label>목표 RIR<input aria-label="목표 RIR" type="number" min={0} max={10} value={item.rir ?? ""} onChange={event => changeItem(day.weekday, index, { rir: event.target.value === "" ? null : Number(event.target.value) })} /></label></div>
                <label>벤치 각도<input value={item.benchAngle} maxLength={40} onChange={event => changeItem(day.weekday, index, { benchAngle: event.target.value })} /></label>
                <label>메모<textarea aria-label="메모" value={item.notes} maxLength={200} onChange={event => changeItem(day.weekday, index, { notes: event.target.value })} /></label>
                <div className="routine-actions"><button type="button" className="button secondary" aria-label={`${weekdays[day.weekday]} ${index + 1}번 위로`} disabled={index === 0} onClick={() => move(day.weekday, index, -1)}>위로</button>
                  <button type="button" className="button secondary" aria-label={`${weekdays[day.weekday]} ${index + 1}번 아래로`} disabled={index === day.items.length - 1} onClick={() => move(day.weekday, index, 1)}>아래로</button>
                  <button type="button" className="button secondary" onClick={() => changeDay(day.weekday, value => ({ ...value, items: value.items.filter((_, i) => i !== index) }))}>종목 제거</button></div>
              </div>;
            })}</div><button className="button secondary" type="button" disabled={day.items.length >= 20} onClick={() => changeDay(day.weekday, value => ({ ...value, items: [...value.items, { exerciseId: "", sets: 3, minReps: 10, maxReps: 12, rir: null, benchAngle: "", notes: "" }] }))}>종목 추가</button></>}
          </fieldset>)}
          <button className="button" type="submit">{busy ? "저장 중…" : selected ? "새 버전 저장" : "루틴 저장"}</button>
        </fieldset>
      </form>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
    </section>
  </div>;
}
