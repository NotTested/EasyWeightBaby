import { pageUser } from "@/lib/page-user";
import { db } from "@/lib/db";
import { ownerWhere } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "오늘 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = await pageUser();
  const sessions = await db.workoutSession.findMany({ where: ownerWhere(user.id), orderBy: { localDate: "desc" }, take: 5 });
  const today = new Intl.DateTimeFormat("ko-KR", { timeZone: user.timeZone, month: "long", day: "numeric", weekday: "long" }).format(new Date());
  return <AppShell user={user}>
    <section className="hero"><div><p className="eyebrow muted">{today}</p><h1>반가워요, {user.name}님.</h1><p className="muted">꾸준함을 기록하는 나만의 공간입니다.</p></div><span className="badge">● 나에게만 보이는 기록</span></section>
    <div className="grid"><section className="card"><p className="eyebrow muted">MY JOURNAL</p><h2>최근 운동일지</h2>{sessions.length ? <ul className="list">{sessions.map(s => <li key={s.id}><strong>{s.title}</strong><br/><span className="muted fine">{s.localDate} · {s.status === "in_progress" ? "진행 중" : s.status}</span></li>)}</ul> : <div className="empty"><span className="empty-symbol" aria-hidden="true">↗</span><h3>첫 기록을 기다리고 있어요.</h3><p className="muted">운동일지 입력 기능은 다음 단계에서 연결됩니다.</p></div>}</section>
    <div className="stack"><section className="card dark"><p className="eyebrow">YOUR OWN PACE</p><h2>지난 나를 기준으로.</h2><p>중량, 반복, 마지막 RIR까지.<br/>다음 운동의 기준을 함께 쌓아갑니다.</p></section><section className="card accent"><span className="badge">준비 중</span><h2>오늘의 운동 계획</h2><p>루틴 선택과 운동 기록 입력은 아직 제공하지 않습니다. 운동 기능이 연결되면 이곳에서 시작할 수 있어요.</p></section></div></div>
  </AppShell>;
}
