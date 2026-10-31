import type { Metadata } from "next";
import Link from "next/link";
import { pageUser } from "@/lib/page-user";
import { AppShell } from "@/components/app-shell";
import { SessionLinks } from "@/components/session-links";
import { historyHref, historyQuerySchema } from "@/lib/history-input";
import { workoutHistory } from "@/lib/workout-history";
import { HttpError } from "@/lib/http";
export const metadata: Metadata = { title: "기록 · 회원님?" };
export const dynamic = "force-dynamic";
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const user = await pageUser(), input = await searchParams;
 const parsed = historyQuerySchema.safeParse(input);
 let result: Awaited<ReturnType<typeof workoutHistory>> | undefined, error = "";
 if (!parsed.success) error = "조회 조건을 확인해주세요. 날짜 범위와 진행 상태를 확인하세요.";
 else try { result = await workoutHistory(user.id, parsed.data); } catch (e) { if (e instanceof HttpError) error = e.message; else throw e; }
 const query = parsed.success ? parsed.data : { status: "all" as const };
 return <AppShell user={user}>
  <section className="hero"><div><p className="eyebrow muted">MY HISTORY</p><h1>운동 기록</h1><p className="muted">실제 운동 날짜순으로 저장한 일지를 확인하세요. 테스트·계획 기록은 제외합니다.</p></div></section>
  <section className="card"><h2>기간별 조회</h2>
   <form key={`${query.from ?? ""}:${query.to ?? ""}:${query.status}`} method="get" action="/history" data-update-safe="true" className="history-filter">
    <div><label htmlFor="history-from">시작일</label><input id="history-from" name="from" type="date" defaultValue={query.from ?? ""} /></div>
    <div><label htmlFor="history-to">종료일</label><input id="history-to" name="to" type="date" defaultValue={query.to ?? ""} /></div>
    <div><label htmlFor="history-status">진행 상태</label><select id="history-status" name="status" defaultValue={query.status}><option value="all">전체</option><option value="in_progress">진행 중</option><option value="completed">완료</option></select></div>
    <button type="submit">기록 조회</button><Link href="/history">조건 초기화</Link>
   </form>
  </section>
  <section className="card"><h2>저장한 운동일지</h2>
   {error && <p role="alert">{error} <Link href="/history">처음부터 조회</Link></p>}
   {result && (result.items.length ? <SessionLinks items={result.items} /> : <p>조건에 맞는 실제 운동 기록이 없습니다.</p>)}
   <nav aria-label="기록 페이지">{parsed.success && query.after && <Link className="button secondary" href={historyHref(query)}>첫 페이지</Link>}
    {result?.nextAfter && <Link className="button secondary" href={historyHref(query, result.nextAfter)}>다음 20개</Link>}</nav>
  </section>
 </AppShell>;
}
