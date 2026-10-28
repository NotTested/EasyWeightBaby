import type { Metadata, Viewport } from "next";
import { PwaInstallProvider } from "@/components/pwa-install";
import { PwaRuntime } from "@/components/pwa-runtime";
import "./globals.css";
export const metadata: Metadata = { title: "회원님? · 나의 운동 기록", description: "오늘의 운동을 쌓아, 다음 운동의 기준으로.",
  appleWebApp: { capable: true, title: "회원님?", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#183b35", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><PwaInstallProvider><PwaRuntime />{children}</PwaInstallProvider></body></html>;
}
