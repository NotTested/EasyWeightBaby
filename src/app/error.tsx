"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="shell section"><section className="card"><h1>잠시 연결이 어렵습니다.</h1><p>저장된 기록은 그대로 유지됩니다. 잠시 후 다시 시도해주세요.</p><button className="button" onClick={reset}>다시 시도</button></section></main>;
}
