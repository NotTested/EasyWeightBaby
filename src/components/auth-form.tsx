"use client";
import { FormEvent, useEffect, useState } from "react";
export function AuthForm({ join = false }: { join?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [registered, setRegistered] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (join && window.location.hash.startsWith("#token=")) {
      setToken(window.location.hash.slice(7));
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (new URLSearchParams(window.location.search).get("draftCleanup") === "failed") setError("로그아웃했지만 기기 초안을 정리하지 못했습니다. 브라우저의 이 사이트 저장 데이터를 확인해주세요.");
    setReady(true);
  }, [join]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    try {
      if (join) {
        const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), email, password, token }) });
        const data = await response.json();
        if (!response.ok) { setError(data.error || "가입하지 못했습니다."); return; }
        setRegistered(true); return;
      }
      const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) { setError(response.status === 429 ? "요청이 많습니다. 잠시 후 다시 시도하세요." : "이메일과 비밀번호를 확인하세요."); return; }
      window.location.assign("/");
    } catch { setError("연결하지 못했습니다. 다시 시도하세요."); }
    finally { setBusy(false); }
  }
  if (registered) return <div className="success" role="status">가입이 완료됐습니다. <a href="/login">로그인하기 →</a></div>;
  return <form onSubmit={submit} method="post">
    <noscript><p>로그인·가입을 사용하려면 브라우저의 JavaScript를 켜주세요.</p></noscript>
    {join && <label>이름<input name="name" autoComplete="name" required maxLength={40} /></label>}
    <label>이메일<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
    <label>비밀번호<input name="password" type="password" autoComplete={join ? "new-password" : "current-password"} required minLength={join ? 12 : undefined} maxLength={128} />
      {join && <span className="help">12자 이상으로 설정해주세요.</span>}</label>
    {join && <label>초대 코드<input name="token" value={token} onChange={e => setToken(e.target.value.trim())} autoComplete="off" required pattern="[a-f0-9]{64}" spellCheck={false} />
      <span className="help">관리자에게 받은 초대 링크 또는 코드를 사용하세요.</span></label>}
    {error && <div className="error" role="alert">{error}</div>}
    <button className="button" disabled={busy || !ready}>{busy ? "처리 중…" : join ? "가입하기" : "로그인"}</button>
    <p className="help">{join ? <a href="/login">이미 계정이 있나요? 로그인</a> : <a href="/join">초대받으셨나요? 가입하기 →</a>}</p>
  </form>;
}
