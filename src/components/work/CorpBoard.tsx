import Link from "next/link";
import { corpPay, corpOpen, corpOverdue, corpName, baht, type CorpOrder } from "@/lib/work/corp";

const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dm = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${TH_M[Number(d.slice(5, 7)) - 1]}` : "—");
const dmy = (d: string | null) => (d ? `${dm(d)} ${(Number(d.slice(0, 4)) + 543) % 100}` : "—");
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

export function Kpi({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "red" | "yellow" | "coral"; href?: string }) {
  const ring = tone === "red" ? "border-red/50 bg-red/5" : tone === "yellow" ? "border-yellow bg-yellow/10" : tone === "coral" ? "border-coral/50 bg-coral/5" : "";
  const inner = (<><div className="text-[11px] text-ink-soft">{label}</div><div className={`font-display font-bold text-xl leading-tight ${tone === "red" ? "text-red" : ""}`}>{value}</div>{sub && <div className="text-[11px] text-ink-soft truncate">{sub}</div>}</>);
  return href ? <Link href={href} className={`card p-3 block hover:border-purple ${ring}`}>{inner}</Link> : <div className={`card p-3 ${ring}`}>{inner}</div>;
}

export function OrderCard({ o, today, href, owner }: { o: CorpOrder; today: string; href: string; owner: string | null }) {
  const late = corpOverdue(o, today); const pay = corpPay(o.pay_status);
  const dueSoon = corpOpen(o) && !!o.due_date && !late && o.due_date <= addDays(today, 7);
  return (
    <Link href={href} className={`card px-2.5 py-2 block hover:border-purple transition ${late ? "border-red/60" : ""}`} title={o.title}>
      <div className="flex items-center justify-between text-[10px] text-ink-soft"><span className="font-mono">{o.order_no}</span>{owner && <span>{owner}</span>}</div>
      <div className="text-[13px] font-semibold leading-tight truncate mt-0.5">{corpName(o)}</div>
      <div className="text-[11px] text-ink-soft leading-tight line-clamp-2">{o.title}</div>
      <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${pay.cls}`}>{pay.label}</span>
        <span className="font-semibold">฿{baht(o.amount)}</span>
      </div>
      <div className={`mt-1 text-[10px] ${late ? "text-red font-semibold" : dueSoon ? "text-[#8a6a00] font-semibold" : "text-ink-soft"}`}>
        {o.status === "delivered" ? `ส่งครบ ${dmy(o.delivered_at)}` : <>{o.due_date ? `ส่ง ${dmy(o.due_date)}` : "ยังไม่กำหนดวันส่ง"}{late && " · เลยกำหนด"}{o.supplier_due && <span className="text-ink-soft font-normal"> · รับซัพ {dm(o.supplier_due)}</span>}</>}
      </div>
    </Link>
  );
}
