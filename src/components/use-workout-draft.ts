"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { draftKey, encodeDraft, logoutKey, parseDraft, type WorkoutModel } from "@/lib/workout-draft";
export function useWorkoutDraft(ownerId: string, model: WorkoutModel, dirty: boolean, busy: boolean) {
 const key = draftKey(ownerId, model.id);
 const [ready, setReady] = useState(false), [pending, setPending] = useState<WorkoutModel | null>(null);
 const [invalid, setInvalid] = useState(false);
 const [notice, setNotice] = useState(""), [signedOut, setSignedOut] = useState(false);
 const stamp = useRef<string | null>(null);
 const raw = useRef<string | null>(null), locked = useRef(false), active = useRef(false);
 const current = useRef({ model, dirty, busy }); current.current = { model, dirty, busy };
 const persist = useCallback(() => {
  if (!active.current || locked.current || !current.current.dirty) return;
  try {
   if (localStorage.getItem(logoutKey(ownerId)) !== stamp.current) { locked.current = true; active.current = false; setSignedOut(true); return; }
   if (localStorage.getItem(key) !== raw.current) { locked.current = true; setNotice("다른 탭이 초안을 변경했습니다. 이 탭의 자동 보관을 중지했습니다. 입력을 텍스트로 내려받아 보관하세요."); return; }
   const next = encodeDraft(ownerId, current.current.model); localStorage.setItem(key, next); raw.current = next;
   setNotice("이 기기에 초안을 보관했습니다. 서버에는 아직 저장하지 않았습니다.");
  } catch { setNotice("기기 초안을 보관하지 못했습니다. 화면을 닫기 전에 입력을 텍스트로 내려받거나 서버에 저장하세요."); }
 }, [key, ownerId]);
 useEffect(() => {
  active.current = true;
  try {
   stamp.current = localStorage.getItem(logoutKey(ownerId));
   raw.current = localStorage.getItem(key);
   if (raw.current) setPending(parseDraft(raw.current, ownerId, current.current.model.id).model);
  } catch { locked.current = true; setInvalid(true); setNotice("기기 초안을 읽지 못했습니다. 서버 기록을 사용 중이며 자동 보관은 중지했습니다."); }
  setReady(true);
  const onLogout = () => { locked.current = true; active.current = false; setPending(null); setSignedOut(true); };
  const custom = (event: Event) => { if ((event as CustomEvent).detail === ownerId) onLogout(); };
  const storage = (event: StorageEvent) => { if (event.key === logoutKey(ownerId)) onLogout(); };
  const before = (event: BeforeUnloadEvent) => { if (!active.current) return; persist(); if (current.current.dirty || current.current.busy) event.preventDefault(); };
  const pagehide = () => persist();
  const click = (event: MouseEvent) => {
   const anchor = (event.target as Element)?.closest?.("a[href]");
   if (!anchor || !active.current || (!current.current.dirty && !current.current.busy)) return;
   const href = anchor.getAttribute("href"); if (!href || href.startsWith("#") || anchor.hasAttribute("download")) return;
   persist();
   if (!window.confirm("서버에 저장하지 않은 입력이 있습니다. 기기 초안 보관 상태를 확인하고 이동할까요?")) { event.preventDefault(); event.stopPropagation(); }
  };
  let channel: BroadcastChannel | undefined;
  try { channel = new BroadcastChannel("member-workout-logout"); channel.onmessage = event => { if (event.data === ownerId) onLogout(); }; } catch { /* storage events remain available */ }
  window.addEventListener("workout-logout", custom); window.addEventListener("storage", storage);
  window.addEventListener("beforeunload", before); window.addEventListener("pagehide", pagehide); document.addEventListener("click", click, true);
  return () => { persist(); active.current = false; channel?.close(); window.removeEventListener("workout-logout", custom); window.removeEventListener("storage", storage); window.removeEventListener("beforeunload", before); window.removeEventListener("pagehide", pagehide); document.removeEventListener("click", click, true); };
 }, [key, ownerId, persist]);
 useEffect(() => { if (ready && !pending) persist(); }, [model, dirty, ready, pending, persist]);
 function discard() {
  try { localStorage.removeItem(key); raw.current = null; locked.current = false; setPending(null); setInvalid(false); setNotice(""); return true; }
  catch { setNotice("기기 초안을 지우지 못했습니다. 브라우저 저장 공간 설정을 확인해주세요."); return false; }
 }
 function saved() {
  try { if (localStorage.getItem(key) === raw.current) localStorage.removeItem(key); raw.current = null; setNotice("서버 저장을 확인했습니다."); }
  catch { setNotice("서버 저장은 완료했지만 기기 초안을 지우지 못했습니다. 다시 열면 이전 초안이 남아 있을 수 있습니다."); }
 }
 function abandon() { if (!discard()) return false; active.current = false; current.current.dirty = false; return true; }
 return { ready, pending, invalid, notice, signedOut, abandon, restore: () => setPending(null), discard, saved, persist };
}
