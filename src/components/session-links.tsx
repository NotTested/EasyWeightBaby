import Link from "next/link";
export function SessionLinks({ items }: { items: Array<{ id: string; title: string; localDate: string; status: string }> }) {
  return <ul className="list session-list">{items.map(item => <li key={item.id}><Link href={`/sessions/${item.id}`}>{item.title}</Link>
    <p className="help">{item.localDate} · {item.status === "in_progress" ? "진행 중" : item.status === "completed" ? "완료" : item.status}</p></li>)}</ul>;
}
