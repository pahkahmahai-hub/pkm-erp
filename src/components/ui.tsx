import Link from "next/link";

export function Header({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {sub && <p className="text-sm text-ink-soft mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, tone, href }: { label: string; value: number | string; tone: "teal" | "coral" | "yellow" | "purple"; href?: string }) {
  const bar = { teal: "bg-teal", coral: "bg-coral", yellow: "bg-yellow", purple: "bg-purple" }[tone];
  const body = (
    <div className="card p-5 overflow-hidden relative">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${bar}`} />
      <div className="text-xs font-semibold tracking-wide text-ink-soft">{label}</div>
      <div className="font-display text-3xl font-bold mt-1">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
