"use client";
import type { CardioRecordInput } from "@/lib/actual-input";
export function CardioEditor({ items, onChange }: { items: CardioRecordInput[]; onChange: (items: CardioRecordInput[]) => void }) {
  function patch(index: number, value: Partial<CardioRecordInput>) { onChange(items.map((item, i) => i === index ? { ...item, ...value } : item)); }
  return <section aria-label="유산소 기록"><h3>유산소</h3>
    <p className="help">시간은 분, 거리는 km입니다. 빈칸과 실제 0을 구분하세요. 강도·Zone 설명은 자유롭게 기록합니다.</p>
    {items.map((item, index) => <fieldset className="actual-set" key={index}><legend>유산소 {index + 1}</legend>
      <div><label htmlFor={`cardio-activity-${index}`}>유산소 종류</label><input id={`cardio-activity-${index}`} maxLength={80} value={item.activity} onChange={e => patch(index, { activity: e.target.value })} /></div>
      <div><label htmlFor={`cardio-duration-${index}`}>운동 시간(분)</label><input id={`cardio-duration-${index}`} type="number" min="0" max="1440" step="any" value={item.durationMinutes ?? ""} onChange={e => patch(index, { durationMinutes: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      <div><label htmlFor={`cardio-distance-${index}`}>거리(km, 선택)</label><input id={`cardio-distance-${index}`} type="number" min="0" max="1000" step="any" value={item.distanceKm ?? ""} onChange={e => patch(index, { distanceKm: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      <div><label htmlFor={`cardio-intensity-${index}`}>강도·Zone 설명</label><input id={`cardio-intensity-${index}`} maxLength={300} value={item.intensity} onChange={e => patch(index, { intensity: e.target.value })} /></div>
      <div><label htmlFor={`cardio-notes-${index}`}>유산소 메모</label><textarea id={`cardio-notes-${index}`} maxLength={1000} value={item.notes} onChange={e => patch(index, { notes: e.target.value })} /></div>
      <label><input type="checkbox" checked={item.completed} onChange={e => patch(index, { completed: e.target.checked })} /> 유산소 수행 완료</label>
      <button type="button" className="secondary" onClick={() => { if (!item.completed || window.confirm("완료한 유산소 기록을 삭제할까요?")) onChange(items.filter((_, i) => i !== index)); }}>유산소 삭제</button>
    </fieldset>)}
    <button type="button" disabled={items.length >= 20} onClick={() => onChange([...items, { activity: "", durationMinutes: null, distanceKm: null, intensity: "", notes: "", completed: false }])}>유산소 추가</button>
  </section>;
}
