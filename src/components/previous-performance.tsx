"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { equipmentLabels, executionLabels, measurementLabels } from "@/lib/exercise-input";
import { kindLabels, sideLabels } from "@/lib/set-performance";
import type { ComparisonResult, performanceSummary } from "@/lib/performance-comparison";
function label(labels: Record<string, string>, value: string) { return labels[value] ?? value; }
function PerformanceRows({ item }: { item: ReturnType<typeof performanceSummary> }) {
 return <div><p>{label(equipmentLabels, item.equipment)} · {label(executionLabels, item.execution)} · {label(measurementLabels, item.measurement)} · 벤치 {item.benchAngle || "미지정"}</p>
  <p>마지막 완료 본세트 RIR: {item.lastWorkingRow === null ? "완료 본세트 없음" : item.lastWorkingRir === null ? "미입력" : item.lastWorkingRir} {item.lastWorkingRow !== null && `(${item.lastWorkingRow}행)`}</p>
  <ol>{item.sets.map((set, index) => <li key={index}>{set.completed ? "수행 완료" : "미완료"} · {label(kindLabels, set.kind)} · {label(sideLabels, set.side)}<br />
   {set.weightKg === null ? "중량 미입력" : `${set.weightKg}kg${["dumbbell", "dumbbell_bench"].includes(item.equipment) ? "(개당)" : "(외부 중량)"}`}{["dumbbell", "dumbbell_bench"].includes(item.equipment) && <> · 덤벨 {set.dumbbellCount === null ? "미입력" : `${set.dumbbellCount}개`}</>} · {set.reps === null ? "반복 미입력" : `${set.reps}회`} · RIR {set.actualRir === null ? "미입력" : set.actualRir}
  </li>)}</ol>{!item.sets.length && <p>저장된 실제 세트 행이 없습니다.</p>}</div>;
}
export function PreviousPerformance({ sessionId }: { sessionId: string }) {
 const [data, setData] = useState<ComparisonResult | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const controller = useRef<AbortController | null>(null);
 useEffect(() => () => controller.current?.abort(), []);
 async function load() {
  controller.current?.abort(); const request = new AbortController(); controller.current = request; setBusy(true); setError(""); setData(null);
  try { const response = await fetch(`/api/sessions/${sessionId}/comparison`, { cache: "no-store", signal: request.signal }); const value = await response.json();
   if (!response.ok) throw new Error(value.error || "이전 수행을 조회하지 못했습니다."); if (!request.signal.aborted) setData(value);
  } catch (e) { if (!request.signal.aborted) setError(e instanceof TypeError ? "연결을 확인하고 다시 조회해주세요." : e instanceof Error ? e.message : "조회하지 못했습니다."); }
  finally { if (!request.signal.aborted) setBusy(false); }
 }
 return <section className="card" aria-label="이전 실제 수행 비교"><h2>이전 실제 수행 비교</h2>
  <p className="help">서버에 저장된 종목을 기준으로, 이전 날짜에 완료한 실제 운동 중 최근 기록을 조회합니다. 같은 날짜·테스트·계획·진행 중 운동은 제외합니다.</p>
  <button type="button" disabled={busy} onClick={load}>{busy ? "비교 조회 중…" : "이전 수행 조회·새로고침"}</button>
  {error && <p role="alert">{error}</p>}
  {data && !data.items.length && <p>저장된 종목이 없습니다. 종목과 실제 수행을 먼저 저장해주세요.</p>}
  {data?.items.map(item => <section className="comparison-item" key={item.id}><h3>{item.current.exerciseName}</h3>
   {item.previous?.differences.length ? <p role="note">장비·수행방식·측정방식 또는 벤치 각도가 달라 직접적인 수치 비교에 주의하세요.</p> : null}
   <div className="comparison-columns"><div><h4>현재 저장 기록 · {data.localDate}</h4><PerformanceRows item={item.current} /></div>
    <div><h4>이전 기록</h4>{item.previous ? <><Link href={`/sessions/${item.previous.session.id}`}>{item.previous.session.localDate} · {item.previous.session.title}</Link><p>{item.previous.performance.exerciseName}</p><PerformanceRows item={item.previous.performance} /></> : <p>이전 날짜의 완료 본세트가 없습니다.</p>}</div></div>
  </section>)}
  <p className="help">미완료·워밍업만 있는 이전 종목은 비교 대상으로 선택하지 않습니다. 표시된 값에서 좌우 측수를 중복 곱하거나 미입력 RIR을 0으로 바꾸지 않습니다. 입력 중인 초안을 바꾸지 않으며, 저장 후 다시 조회하면 갱신됩니다.</p>
 </section>;
}
