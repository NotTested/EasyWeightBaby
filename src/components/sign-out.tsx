"use client";
import { useState } from "react";
export function SignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <span><button className="link-button" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      window.location.assign("/login");
    } catch { setError("로그아웃 실패"); setBusy(false); }
  }}>{busy ? "종료 중…" : "로그아웃"}</button>{error && <span role="alert"> {error}</span>}</span>;
}
