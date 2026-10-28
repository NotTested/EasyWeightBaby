import type { Metadata } from "next";
import Link from "next/link";
import { pageUser } from "@/lib/page-user";
import { AppShell } from "@/components/app-shell";
import { RoutineManager } from "@/components/routine-manager";
export const metadata: Metadata = { title: "루틴 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function RoutinesPage() {
  const user = await pageUser();
  return <AppShell user={user}>
    <section className="hero"><div><p className="eyebrow muted">MY ROUTINE</p><h1>주간 루틴</h1>
      <p className="muted">나에게 맞는 순서와 목표를 쌓아가세요.</p></div></section>
    <p><Link className="button secondary" href="/exercises">운동 종목 관리</Link></p>
    <p className="help">계획과 실제 수행은 따로 관리합니다. 운동 시작·수행 기록 입력은 다음 단계에서 제공합니다.</p>
    <RoutineManager />
  </AppShell>;
}
