"use client";
import { useState } from "react";
import { clearAccountDrafts } from "@/lib/workout-draft";
export function SignOut({ ownerId }: { ownerId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <span><button className="link-button" disabled={busy} onClick={async () => {
    if (document.querySelector('[data-unsaved-changes="true"]') && !window.confirm("로그아웃하면 이 계정의 기기 초안이 삭제됩니다. 계속할까요?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      const cleared = clearAccountDrafts(ownerId);
      window.location.assign(cleared ? "/login" : "/login?draftCleanup=failed");
    } catch { setError("로그아웃 실패"); setBusy(false); }
  }}>{busy ? "종료 중…" : "로그아웃"}</button>{error && <span role="alert"> {error}</span>}</span>;
}
