"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { draftAccountPrefix, parseDraft } from "@/lib/workout-draft";
export function WorkoutDraftLinks({ ownerId }: { ownerId: string }) {
 const [items, setItems] = useState<Array<{ id: string; savedAt: number }>>([]);
 useEffect(() => {
  try {
   const prefix = draftAccountPrefix(ownerId);
   setItems(Object.keys(localStorage).filter(key => key.startsWith(prefix)).flatMap(key => {
    try { const id = decodeURIComponent(key.slice(prefix.length)); const draft = parseDraft(localStorage.getItem(key)!, ownerId, id); return [{ id, savedAt: draft.savedAt }]; } catch { return []; }
   }).sort((a, b) => b.savedAt - a.savedAt));
  } catch { /* The editor reports local storage errors when opened. */ }
 }, [ownerId]);
 if (!items.length) return null;
 return <section className="card"><h2>이 기기의 미저장 초안</h2><p>온라인에서 운동을 열어 복구를 선택하세요. 서버 저장과 별개입니다.</p><ul>{items.map(item => <li key={item.id}><Link href={`/sessions/${encodeURIComponent(item.id)}`}>운동 초안 열기 · {new Date(item.savedAt).toLocaleString("ko-KR")}</Link></li>)}</ul></section>;
}
