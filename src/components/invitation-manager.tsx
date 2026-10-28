"use client";
import { FormEvent, useEffect, useState } from "react";
type Invitation = { id: string; email: string | null; expiresAt: string; usedAt: string | null; revokedAt: string | null };
export function InvitationManager() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [link, setLink] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/admin/invitations");
    if (!response.ok) throw new Error("초대 목록을 불러오지 못했습니다.");
    setItems((await response.json()).items);
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setLink("");
    const form = new FormData(event.currentTarget); const email = String(form.get("email") || "").trim().toLowerCase();
    try {
      const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(email ? { email } : {}), days: Number(form.get("days")) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "초대 생성 실패");
      setLink(`${window.location.origin}/join#token=${data.token}`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "요청 실패"); } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/invitations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("초대를 취소하지 못했습니다.");
      setLink(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "요청 실패"); } finally { setBusy(false); }
  }
  return <div className="grid"><section className="card"><h2>새 초대 만들기</h2><form onSubmit={create}><label>받는 사람 이메일 (선택)<input type="email" name="email" maxLength={254} /><span className="help">지정하면 해당 이메일로만 가입할 수 있어요.</span></label><label>유효 기간<select name="days" defaultValue="7"><option value="1">1일</option><option value="7">7일</option><option value="30">30일</option></select></label><button className="button" disabled={busy}>초대 링크 만들기</button></form>
    {link && <div className="section"><div className="success" role="status"><label>초대 링크<input readOnly value={link} onFocus={e => e.target.select()} /></label><p className="fine">이 화면에서만 확인할 수 있습니다. 링크를 복사해 직접 전달하세요.</p></div></div>}{error && <p className="error" role="alert">{error}</p>}</section>
    <section className="card"><h2>최근 초대</h2>{!items.length && <p className="muted">아직 발급한 초대가 없습니다.</p>}<ul className="list">{items.map(item => { const expired = new Date(item.expiresAt) <= new Date(); const active = !item.usedAt && !item.revokedAt && !expired; return <li key={item.id}><div className="row"><span><strong>{item.email || "이메일 제한 없음"}</strong><br/><span className="fine muted">{item.usedAt ? "가입 완료" : item.revokedAt ? "취소됨" : expired ? "만료됨" : "사용 가능"} · {new Date(item.expiresAt).toLocaleDateString("ko-KR")} 만료</span></span>{active && <button disabled={busy} className="button secondary small" onClick={() => revoke(item.id)}>취소</button>}</div></li>; })}</ul></section></div>;
}
