import type { ReactNode } from "react";
import Link from "next/link";
import { isAdmin } from "@/lib/access";
import { AppNavigation } from "./app-navigation";
import { SignOut } from "./sign-out";

export function AppShell({ user, children }: {
  user: { id: string; name: string; role?: string }; children: ReactNode;
}) {
  return <div className="shell app-shell">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="topbar app-topbar">
      <Link className="brand" href="/">회원님?<small>WORKOUT JOURNAL</small></Link>
      <nav className="nav account-menu" aria-label="계정 메뉴">
        {isAdmin(user) && <Link href="/admin/invitations">친구 초대</Link>}
        <span className="account-name">{user.name}님</span><SignOut ownerId={user.id} />
      </nav>
    </header>
    <AppNavigation />
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="footer">회원님? · 개인 운동 기록은 계정별로 관리됩니다.</footer>
  </div>;
}
