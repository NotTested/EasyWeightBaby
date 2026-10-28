"use client";
import { useEffect, useRef, useState } from "react";

function hasPendingInput() {
  if (document.querySelector('[data-unsaved-changes="true"]')) return true;
  return Array.from(document.querySelectorAll("form input, form textarea, form select")).some(element => {
    // Editors may mark server-confirmed values safe, but must remove this marker on edits/in-flight saves.
    if (element.closest('form[data-update-safe="true"]')) return false;
    if (element instanceof HTMLInputElement) {
      if (element.disabled || element.readOnly || ["hidden", "submit", "button", "reset"].includes(element.type)) return false;
      if (["checkbox", "radio"].includes(element.type)) return element.checked !== element.defaultChecked;
      // Includes browser-autofilled credentials and invitation tokens removed from the URL.
      return element.value.length > 0;
    }
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly && !!element.value;
    if (element instanceof HTMLSelectElement && !element.disabled) {
      const initial = Array.from(element.options).findIndex(option => option.defaultSelected);
      return element.selectedIndex !== (initial < 0 ? 0 : initial);
    }
    return false;
  });
}

export function PwaRuntime() {
  const [offline, setOffline] = useState(false);
  const [restored, setRestored] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const requested = useRef(false);
  useEffect(() => {
    const onOffline = () => { setOffline(true); setRestored(false); };
    const onOnline = () => { setOffline(false); setRestored(true); };
    setOffline(!navigator.onLine);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => { window.removeEventListener("offline", onOffline); window.removeEventListener("online", onOnline); };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    let hadController = !!navigator.serviceWorker.controller;
    const onController = () => {
      // First installation claims the page without reloading it.
      if (!hadController) {
        hadController = true;
        if (!requested.current) return;
      }
      if (requested.current && !hasPendingInput()) window.location.reload();
      else {
        requested.current = false; setBusy(false); setAvailable(true);
        setMessage("새 버전이 준비됐습니다. 입력을 마친 뒤 새로 고침해주세요.");
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    cleanups.push(() => navigator.serviceWorker.removeEventListener("controllerchange", onController));
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(reg => {
      if (cancelled) return;
      registration.current = reg;
      const checkWaiting = () => { if (reg.waiting) setAvailable(true); };
      const onUpdate = () => {
        const worker = reg.installing;
        if (!worker) return;
        const onState = () => { if (worker.state === "installed") checkWaiting(); };
        worker.addEventListener("statechange", onState);
        cleanups.push(() => worker.removeEventListener("statechange", onState));
      };
      checkWaiting(); onUpdate();
      reg.addEventListener("updatefound", onUpdate);
      const checkVersion = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
      window.addEventListener("focus", checkVersion);
      cleanups.push(() => reg.removeEventListener("updatefound", onUpdate), () => window.removeEventListener("focus", checkVersion));
    }).catch(() => { if (!cancelled) setMessage("오프라인 안내를 준비하지 못했습니다. 온라인 기능은 계속 사용할 수 있어요."); });
    return () => { cancelled = true; cleanups.forEach(cleanup => cleanup()); };
  }, []);

  function applyUpdate() {
    if (!navigator.onLine) { setMessage("연결이 복구된 뒤 업데이트해주세요."); return; }
    if (hasPendingInput()) { setMessage("입력 중인 내용이 있습니다. 입력을 마치거나 정리한 뒤 업데이트해주세요."); return; }
    const waiting = registration.current?.waiting;
    if (!waiting) { window.location.reload(); return; }
    requested.current = true; setBusy(true); setMessage("");
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }

  if (!offline && !restored && !available && !message) return null;
  return <aside className="runtime-notices" aria-label="연결 및 업데이트 안내">
    {offline && <p role="status">연결이 끊겼습니다. 표시된 정보가 최신이 아닐 수 있으며, 서버 저장을 확인할 수 없습니다.</p>}
    {!offline && restored && <p role="status">연결이 복구됐습니다. 작업 결과와 저장 상태를 확인해주세요.</p>}
    {available && <div className="update-notice"><p>새 버전이 준비됐습니다. 입력을 마친 뒤 적용해주세요.</p>
      <button className="button secondary" onClick={applyUpdate} disabled={busy || offline}>{busy ? "업데이트 중…" : "업데이트 적용"}</button></div>}
    {message && <p role="status">{message}</p>}
  </aside>;
}
