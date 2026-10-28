import type { Metadata } from "next";
import Link from "next/link";
import { pageUser } from "@/lib/page-user";
import { isAdmin } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { PwaInstall } from "@/components/pwa-install";
export const metadata: Metadata = { title: "설정 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const user = await pageUser();
  return <AppShell user={user}>
    <section className="hero"><div><p className="eyebrow muted">MY ACCOUNT</p><h1>설정</h1>
      <p className="muted">내 계정과 현재 사용 환경을 확인하세요.</p></div></section>
    <div className="grid"><section className="card"><h2>내 계정</h2>
      <dl className="account-details"><div><dt>이름</dt><dd>{user.name}</dd></div>
        <div><dt>이메일</dt><dd>{user.email}</dd></div><div><dt>운동 날짜 기준</dt><dd>{user.timeZone}</dd></div>
        <div><dt>계정 유형</dt><dd>{isAdmin(user) ? "관리자" : "일반 회원"}</dd></div></dl>
      <p className="help">현재는 조회만 가능합니다. 계정 정보와 시간대 편집은 아직 제공하지 않습니다.</p>
    </section><div className="stack"><section className="card"><h2>앱 사용</h2>
      <PwaInstall />
    </section>{isAdmin(user) && <section className="card accent"><h2>초대 관리</h2>
      <p>함께할 친구·동료에게 초대를 발급하고 취소할 수 있어요.</p>
      <Link className="button" href="/admin/invitations">초대 관리 열기</Link>
    </section>}</div></div>
  </AppShell>;
}
