import type { Metadata } from "next";
import Link from "next/link";
import { pageUser } from "@/lib/page-user";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = { title: "루틴 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function RoutinesPage() {
  const user = await pageUser();
  return <AppShell user={user}>
    <section className="hero"><div><p className="eyebrow muted">MY ROUTINE</p><h1>주간 루틴</h1>
      <p className="muted">나에게 맞는 순서와 목표를 쌓아가세요.</p></div></section>
    <section className="card placeholder-card"><span className="badge">준비 중</span>
      <h2>요일별 계획을 준비하고 있어요.</h2><p className="muted">루틴 만들기·편집과 운동 시작은 아직 제공하지 않습니다. 기존 Notion 루틴도 아직 가져오지 않은 상태입니다.</p>
      <Link className="button secondary" href="/">오늘로 돌아가기</Link>
    </section>
  </AppShell>;
}
