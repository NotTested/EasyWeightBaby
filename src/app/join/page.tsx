import { AuthForm } from "@/components/auth-form";
export default function JoinPage() {
  return <main className="shell"><header className="topbar"><a className="brand" href="/">회원님?</a><a href="/login">로그인</a></header><div className="auth-wrap">
    <section className="auth-story"><div><p className="eyebrow">LET’S GET STARTED</p><h1>함께 시작해도,<br/>기록은 나답게.</h1><p>친구·동료의 초대로 시작하는<br/>나만의 운동일지.</p></div><span className="fine">초대는 한 번만 사용할 수 있어요.</span></section>
    <section className="auth-form"><h2>초대받은 회원님, 환영해요.</h2><p className="muted">계정을 만들고 기록을 시작하세요.</p><AuthForm join /></section></div></main>;
}
