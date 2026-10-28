import { AuthForm } from "@/components/auth-form";
export default function LoginPage() {
  return <main className="shell"><header className="topbar"><a className="brand" href="/">회원님?<small>WORKOUT JOURNAL</small></a><span className="muted fine">나의 속도로, 꾸준하게.</span></header>
    <div className="auth-wrap"><section className="auth-story"><div><p className="eyebrow">ONE MORE RECORD</p><h1>오늘의 한 세트가<br/>내일의 기준으로.</h1><p>나의 운동을 기록하고,<br/>지난 나와 비교해보세요.</p></div><div className="line-art" aria-hidden="true">━ ▐ ▬ ▌ ━</div><span className="fine">운동 기록은 기본적으로 나에게만 보여요.</span></section>
    <section className="auth-form"><p className="eyebrow muted">WELCOME BACK</p><h2>반가워요, 회원님.</h2><p className="muted">이어서 운동 기록을 쌓아볼까요?</p><AuthForm /></section></div></main>;
}
