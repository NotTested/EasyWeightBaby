import type { Metadata } from "next";
import Link from "next/link";
import { pageUser } from "@/lib/page-user";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = { title: "기록 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function HistoryPage() {
  const user = await pageUser();
  return <AppShell user={user}>
    <section className="hero"><div><p className="eyebrow muted">MY HISTORY</p><h1>운동 기록</h1>
      <p className="muted">지난 운동을 다음 운동의 기준으로.</p></div></section>
    <section className="card placeholder-card"><span className="badge">준비 중</span>
      <h2>기록을 모아볼 공간이에요.</h2><p className="muted">기록 목록·달력과 상세 조회는 아직 제공하지 않습니다. 현재 저장된 최근 일지는 오늘 화면에서 확인할 수 있어요.</p>
      <Link className="button secondary" href="/">오늘로 돌아가기</Link>
    </section>
  </AppShell>;
}
