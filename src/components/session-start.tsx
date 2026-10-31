"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { weekdays, type RoutineDetail } from "@/lib/routine-input";

import { startSessionSchema, type StartSessionInput } from "@/lib/session-input";
import { startRequestKey, logoutKey } from "@/lib/workout-draft";

export function SessionStart({ ownerId, date, timeZone, routines }: { ownerId: string; date: string; timeZone: string; routines: Array<{ id: string; name: string; version: number }> }) {
  const [title, setTitle] = useState("나의 운동");
  const [localDate, setLocalDate] = useState(date);
  const [routineId, setRoutineId] = useState("");
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [versions, setVersions] = useState<number[]>([]);
  const [weekday, setWeekday] = useState((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const generation = useRef(0), sending = useRef(false), stamp = useRef<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState<StartSessionInput | null>(null), [ready, setReady] = useState(false);
  const storageKey = startRequestKey(ownerId);
  useEffect(() => {
    try {
      stamp.current = localStorage.getItem(logoutKey(ownerId));
      const raw = localStorage.getItem(storageKey);
      if (raw) { const value = JSON.parse(raw); if (value.ownerId !== ownerId) throw new Error(); setPending(startSessionSchema.parse(value.request)); }
    } catch { setBlocked(true); setError("보관된 시작 요청을 읽지 못했습니다. 진행 중 목록을 먼저 확인해주세요."); }
    setReady(true);
  }, [ownerId, storageKey]);
  function clearPending() { localStorage.removeItem(storageKey); setPending(null); setBlocked(false); }
  async function send(request: StartSessionInput) {
    if (sending.current) return;
    if (!navigator.onLine) { setError("연결 후 시작 요청을 확인해주세요. 오프라인에서는 새 운동을 만들지 않습니다."); return; }
    sending.current = true; setBusy(true); setError("");
    try {
      if (localStorage.getItem(logoutKey(ownerId)) !== stamp.current) throw new Error("로그아웃 상태가 변경됐습니다. 다시 로그인해주세요.");
      try { localStorage.setItem(storageKey, JSON.stringify({ ownerId, request })); setPending(request); }
      catch { throw new Error("시작 요청을 기기에 보관하지 못해 전송하지 않았습니다. 브라우저 저장 공간을 확인해주세요."); }
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      const data = await response.json();
      if (!response.ok) {
        if ([400, 403, 404, 415].includes(response.status)) clearPending();
        throw new Error(data.error || "시작 상태를 확인하지 못했습니다. 진행 중 목록을 확인해주세요.");
      }
      clearPending(); setDirty(false); window.location.assign(`/sessions/${data.item.id}`);
    } catch (e) { setError(e instanceof TypeError ? "시작 상태를 확인하지 못했습니다. 보관된 동일 요청으로 다시 확인해주세요." : e instanceof Error ? e.message : "시작 상태를 확인하지 못했습니다."); }
    finally { sending.current = false; setBusy(false); }
  }
  async function choose(id: string, version?: number) {
    const current = ++generation.current; setDirty(true); setRoutineId(id); setDetail(null); setError("");
    if (!id) { setVersions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/routines/${id}${version ? `?version=${version}` : ""}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "계획을 불러오지 못했습니다.");
      if (current === generation.current) { setDetail(data.item); setVersions(data.versions.map((value: { number: number }) => value.number)); }
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : "계획을 불러오지 못했습니다."); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy || loading) return;
    if (routineId && (!detail || !detail.days.some(day => day.weekday === weekday && !day.rest))) {
      setError("운동할 계획 요일을 확인해주세요."); return;
    }
    if (pending) return;
    const payload = { title: title.trim(), localDate, source: routineId && detail ? { routineId, version: detail.version, weekday } : null };
    const fingerprint = JSON.stringify(payload);
    try {
      if (attempt.current?.payload !== fingerprint) attempt.current = { payload: fingerprint, key: crypto.randomUUID() };
      await send(startSessionSchema.parse({ requestId: attempt.current!.key, ...payload }));
    } catch { setError("운동 제목·날짜·계획을 확인해주세요."); }
  }
  const day = detail?.days.find(value => value.weekday === weekday);
  return <section className="card" data-unsaved-changes={dirty || busy ? "true" : undefined}>
    <h2>새 운동 시작</h2><p className="help">진행 중인 운동이 있다면 먼저 이어서 열어주세요. 별도의 새 운동을 시작할 수도 있습니다.</p>
    {blocked && <button type="button" onClick={() => { if (window.confirm("진행 중 운동을 먼저 확인한 뒤 읽을 수 없는 시작 요청을 삭제할까요?")) { try { clearPending(); setError(""); } catch { setError("시작 요청을 지우지 못했습니다. 브라우저 저장 공간을 확인해주세요."); } } }}>보관된 시작 요청 초기화</button>}
    {pending && <aside><p>확인되지 않은 시작 요청: {pending.title} · {pending.localDate}</p>
      <button type="button" disabled={busy} onClick={() => send(pending)}>동일 시작 요청 다시 확인</button>
      <button type="button" disabled={busy} onClick={() => { if (window.confirm("진행 중 운동을 확인했나요? 보관된 시작 요청을 삭제하면 이후 새 요청은 별도 운동이 됩니다.")) { try { clearPending(); } catch { setError("보관된 시작 요청을 지우지 못했습니다."); } } }}>시작 요청 삭제</button></aside>}
    <form method="post" onSubmit={start} data-update-safe={!dirty && !busy ? "true" : undefined}>
      <fieldset className="routine-editor" disabled={busy || !ready || !!pending || blocked}>
        <label>운동 제목<input required maxLength={100} value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} /></label>
        <label>실제 운동 날짜<input type="date" required value={localDate} onChange={event => { setLocalDate(event.target.value); setDirty(true); }} /></label>
        <p className="help">날짜 기준: {timeZone}. 선택한 계획 요일과 실제 날짜는 따로 보존합니다.</p>
        <label>시작할 계획<select aria-label="시작할 계획" value={routineId} onChange={event => void choose(event.target.value)}><option value="">빈 운동</option>
          {routines.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
        {routineId && <><label>계획 버전<select aria-label="계획 버전" disabled={loading || !detail} value={detail?.version ?? ""} onChange={event => void choose(routineId, Number(event.target.value))}>
          {!detail && <option value="">불러오는 중</option>}{versions.map(version => <option key={version} value={version}>v{version}</option>)}</select></label>
          <label>계획 요일<select aria-label="계획 요일" value={weekday} onChange={event => { setWeekday(Number(event.target.value)); setDirty(true); }}>{weekdays.map((name, index) => <option key={name} value={index}>{name}요일</option>)}</select></label>
          {day?.rest && <p role="status">휴식일입니다. 다른 계획 요일을 선택하거나 빈 운동으로 시작해주세요.</p>}
          {day && !day.rest && <ol>{day.items.map((item, index) => <li key={index}>{item.exerciseName} · 목표 {item.sets}세트 × {item.minReps}–{item.maxReps}회</li>)}</ol>}
        </>}
        <button className="button" type="submit" disabled={loading || (!!routineId && (!detail || !!day?.rest))}>{busy ? "시작 확인 중…" : "운동 시작"}</button>
      </fieldset>
    </form>
    {!routines.length && <p className="help">저장된 루틴이 없습니다. <Link href="/routines">루틴 만들기</Link> 또는 빈 운동으로 시작하세요.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
