import { WorkoutDraftLinks } from "@/components/workout-draft-links";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { pageUser } from "@/lib/page-user";
import { todayInZone } from "@/lib/session-input";
import { AppShell } from "@/components/app-shell";
import { SessionStart } from "@/components/session-start";
import { SessionLinks } from "@/components/session-links";
export const metadata: Metadata = { title: "운동 시작 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function SessionsPage() {
  const user = await pageUser();
  const [ongoing, routines] = await Promise.all([
    db.workoutSession.findMany({ where: { ownerId: user.id, recordKind: "actual", status: "in_progress" }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, title: true, localDate: true, status: true } }),
    db.routine.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, name: true, version: true } }),
  ]);
  return <AppShell user={user}><section className="hero"><div><h1>운동 시작</h1><p className="muted">이어서 열거나, 새로운 운동을 시작하세요.</p></div></section>
    <div className="stack"><WorkoutDraftLinks ownerId={user.id} /><section className="card"><h2>진행 중인 운동</h2>{ongoing.length ? <SessionLinks items={ongoing} /> : <p>진행 중인 운동이 없습니다.</p>}</section>
      <SessionStart ownerId={user.id} date={todayInZone(user.timeZone)} timeZone={user.timeZone} routines={routines} /></div>
  </AppShell>;
}
