import { pageUser } from "@/lib/page-user";
import { isAdmin } from "@/lib/access";
import { notFound } from "next/navigation";
import { InvitationManager } from "@/components/invitation-manager";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function InvitationsPage() {
  const user = await pageUser(); if (!isAdmin(user)) notFound();
  return <AppShell user={user}><section className="hero"><div><p className="eyebrow muted">INVITE YOUR PEOPLE</p><h1>함께할 회원님을 초대해요.</h1><p className="muted">초대는 한 번만 사용되며, 기록은 각자의 계정에 보관됩니다.</p></div></section><InvitationManager /></AppShell>;
}
