"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = { ready: boolean; secure: boolean; installed: boolean; standalone: boolean; available: boolean;
  busy: boolean; message: string; install(): Promise<void> };
const InstallContext = createContext<InstallState | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [secure, setSecure] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const updateDisplay = () => {
      const active = standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setStandaloneMode(active);
      if (active) setInstalled(true);
    };
    const onPrompt = (event: Event) => { event.preventDefault(); setDeferred(event as InstallEvent); setMessage(""); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); setMessage(""); };
    updateDisplay(); setSecure(window.isSecureContext); setReady(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener("change", updateDisplay);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener("change", updateDisplay);
    };
  }, []);
  async function install() {
    if (!deferred || busy) return;
    setBusy(true); setMessage("");
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setMessage(choice.outcome === "accepted" ? "설치를 요청했습니다. 브라우저의 완료 안내를 확인하세요." :
        "설치를 취소했습니다. 브라우저에서 계속 사용할 수 있어요.");
    } catch { setMessage("설치 창을 열지 못했습니다. 브라우저 메뉴에서 설치를 시도해주세요."); }
    finally { setDeferred(null); setBusy(false); }
  }
  return <InstallContext.Provider value={{ ready, secure, installed, standalone: standaloneMode, available: !!deferred, busy, message, install }}>
    {children}
  </InstallContext.Provider>;
}

export function PwaInstall() {
  const state = useContext(InstallContext);
  if (!state?.ready) return <p className="muted">설치 가능 여부를 확인하고 있어요.</p>;
  if (state.installed) return <p role="status">{state.standalone ? "설치된 앱으로 사용 중입니다. 같은 계정의 기록을 이용할 수 있어요." :
    "설치가 완료됐습니다. 기기의 앱 목록에서 열어주세요. 이 브라우저에서도 계속 사용할 수 있어요."}</p>;
  return <div>
    <p className="muted">브라우저와 설치한 앱에서 같은 계정·기록을 사용합니다. 설치하지 않아도 이용할 수 있어요.</p>
    {!state.secure ? <p>설치하려면 HTTPS 주소로 접속해주세요.</p> : state.available ?
      <button className="button" onClick={state.install} disabled={state.busy}>{state.busy ? "설치 창 여는 중…" : "앱 설치하기"}</button> :
      <p className="help">Chrome 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 확인해주세요. 이미 설치했거나 브라우저·기기에서 지원하지 않으면 설치 메뉴가 없을 수 있어요. iPhone·iPad는 Safari 공유 메뉴에서 ‘홈 화면에 추가’를 선택하세요.</p>}
    {state.message && <p role="status" className="help">{state.message}</p>}
    <p className="help">현재는 연결된 상태에서 사용합니다. 앱 제거는 서버의 계정·운동 기록을 삭제하지 않습니다.</p>
  </div>;
}
