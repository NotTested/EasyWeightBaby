import { ActualWorkout } from "@/components/actual-workout";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sessionDetailSelect } from "@/lib/workouts";
import { weekdays } from "@/lib/routine-input";
import { pageUser } from "@/lib/page-user";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = { title: "진행 중인 운동 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser(), { id } = await params;
  const item = await db.workoutSession.findFirst({ where: { id, ownerId: user.id }, select: sessionDetailSelect });
  if (!item) notFound();
  return <AppShell user={user}><section className="hero"><div><p className="eyebrow">{item.status === "in_progress" ? "진행 중" : item.status === "completed" ? "완료" : item.status}</p>
    <h1>{item.title}</h1><p>실제 운동 날짜: {item.localDate} · {item.timeZone}</p>
    <p className="help">{item.startedAt ? `시작 시각: ${new Intl.DateTimeFormat("ko-KR", { timeZone: item.timeZone, dateStyle: "short", timeStyle: "short" }).format(item.startedAt)}` : "시작 시각 미기록"}</p></div></section>
    <section className="card"><h2>계획 목표</h2>
      <p>{item.routineName ? `${item.routineName} · v${item.routineNumber} · ${weekdays[item.routineWeekday!]}요일 계획` : "연결된 계획 없음"}</p>
      <p className="help">아래 내용은 시작할 때 가져온 목표이며 실제 수행 기록이 아닙니다. 실제 수행은 아래에서 별도로 입력하세요.</p>
      {item.exercises.length ? <ol className="session-goals">{item.exercises.map(exercise => <li key={exercise.id}><h3>{exercise.exerciseName}</h3>
        <p>{exercise.goalSets === null ? "직접 추가한 종목 · 계획 목표 없음" : <>목표 {exercise.goalSets}세트 × {exercise.goalMinReps}–{exercise.goalMaxReps}회 · 목표 RIR {exercise.goalRir === null ? "미지정" : exercise.goalRir}</>}</p>
        {exercise.benchAngle && <p>벤치 각도: {exercise.benchAngle}</p>}{exercise.notes && <p className="exercise-notes">{exercise.notes}</p>}</li>)}</ol> : <p>가져온 계획 종목이 없습니다. 아래에서 종목을 추가하세요.</p>}
    </section><ActualWorkout initial={item} /><p><Link className="button secondary" href="/sessions">진행 중 목록</Link></p>
  </AppShell>;
}
