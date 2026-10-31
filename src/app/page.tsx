import { pageUser } from "@/lib/page-user";
import { db } from "@/lib/db";
import { ownerWhere } from "@/lib/access";
import Link from "next/link";
import { SessionLinks } from "@/components/session-links";
import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "오늘 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = await pageUser();
  const sessions = await db.workoutSession.findMany({ where: { ...ownerWhere(user.id), recordKind: "actual" }, orderBy: { localDate: "desc" }, take: 5 });
  const ongoing = await db.workoutSession.findMany({ where: { ownerId: user.id, recordKind: "actual", status: "in_progress" }, orderBy: { createdAt: "desc" }, take: 10 });
  const today = new Intl.DateTimeFormat("ko-KR", { timeZone: user.timeZone, month: "long", day: "numeric", weekday: "long" }).format(new Date());
  return <AppShell user={user}>
    <section className="hero"><div><p className="eyebrow muted">{today}</p><h1>반가워요, {user.name}님.</h1><p className="muted">꾸준함을 기록하는 나만의 공간입니다.</p></div><span className="badge">● 나에게만 보이는 기록</span></section>
    <div className="grid"><section className="card"><p className="eyebrow muted">MY JOURNAL</p><h2>최근 운동일지</h2>{sessions.length ? <SessionLinks items={sessions} /> : <p className="muted">아직 저장한 운동이 없습니다.</p>}</section>
    <div className="stack"><section className="card dark"><p className="eyebrow">YOUR OWN PACE</p><h2>지난 나를 기준으로.</h2><p>중량, 반복, 마지막 RIR까지.<br/>다음 운동의 기준을 함께 쌓아갑니다.</p></section><section className="card accent"><h2>진행 중인 운동</h2>{ongoing.length ? <SessionLinks items={ongoing} /> : <p>진행 중인 운동이 없습니다.</p>}<Link className="button" href="/sessions">운동 시작·이어서 열기</Link></section></div></div>
  </AppShell>;
}
