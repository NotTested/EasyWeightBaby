"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "오늘", mark: "01" },
  { href: "/history", label: "기록", mark: "02" },
  { href: "/routines", label: "루틴", mark: "03" },
  { href: "/settings", label: "설정", mark: "04" },
];
export function AppNavigation() {
  const pathname = usePathname();
  return <nav className="app-navigation" aria-label="주 메뉴">
    {destinations.map(({ href, label, mark }) => <Link key={href} href={href}
      aria-current={pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ? "page" : undefined}>
      <span className="navigation-mark" aria-hidden="true">{mark}</span><span>{label}</span>
    </Link>)}
  </nav>;
}
