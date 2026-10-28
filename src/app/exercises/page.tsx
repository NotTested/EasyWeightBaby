import type { Metadata } from "next";
import { pageUser } from "@/lib/page-user";
import { isAdmin } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { ExerciseManager } from "@/components/exercise-manager";

export const metadata: Metadata = { title: "운동 종목 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function ExercisesPage() {
  const user = await pageUser();
  return <AppShell user={user}><section className="hero"><div><p className="eyebrow muted">EXERCISE LIBRARY</p>
    <h1>운동 종목</h1><p className="muted">이름과 별칭, 도구와 수행 방식을 관리하세요.</p></div></section>
    <ExerciseManager admin={isAdmin(user)} />
  </AppShell>;
}
