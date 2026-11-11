import Link from "next/link";
import { ChevronRight, LayoutGrid } from "lucide-react";

export type Crumb = { href: string; label: string };
/** breadcrumb trail: โปรแกรมทั้งหมด › ... › current page */
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-ink-soft mb-1">
      <Link href="/" className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 hover:border-purple hover:text-purple"><LayoutGrid size={12} /> โปรแกรมทั้งหมด</Link>
      {items.map((c) => <span key={c.href} className="inline-flex items-center gap-1"><ChevronRight size={12} /><Link href={c.href} className="rounded-full border border-line bg-white px-2.5 py-1 hover:border-purple hover:text-purple">{c.label}</Link></span>)}
    </nav>
  );
}

export function Header({ title, sub, action, crumbs }: { title: string; sub?: string; action?: React.ReactNode; crumbs?: Crumb[] }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {crumbs && <Crumbs items={crumbs} />}
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
