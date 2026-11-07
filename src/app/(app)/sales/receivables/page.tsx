import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { DOC_META, type SalesDoc } from "@/lib/sales/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
type Row = SalesDoc & { company_code: string; outstanding: number; overdue: boolean };

export default async function Receivables() {
  const supabase = await createClient();
  const { data } = await supabase.from("sales_receivables").select("*").order("due_date", { ascending: true, nullsFirst: false });
  const rows = (data ?? []) as Row[];
  const total = rows.reduce((a, r) => a + Number(r.outstanding), 0);
  const overdue = rows.filter((r) => r.overdue).reduce((a, r) => a + Number(r.outstanding), 0);
  const byCustomer = Object.values(rows.reduce<Record<string, { name: string; amount: number; n: number }>>((acc, r) => { const k = r.customer_name; acc[k] = acc[k] ?? { name: k, amount: 0, n: 0 }; acc[k].amount += Number(r.outstanding); acc[k].n++; return acc; }, {})).sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      <Header title="ลูกหนี้ / รอรับชำระ" sub={`${rows.length} ใบ · คงค้าง ฿${fmt(total)} · เลยกำหนด ฿${fmt(overdue)}`} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>เอกสาร</th><th>ลูกค้า</th><th>วันที่</th><th>ครบกำหนด</th><th className="text-right">ยอด</th><th className="text-right">รับแล้ว</th><th className="text-right">คงค้าง</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.overdue ? "bg-red/5" : ""}>
                  <td><Link href={`/sales/docs/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.doc_no}</Link><div className="text-[10px] text-ink-soft">{DOC_META[r.doc_type].prefix} · {r.company_code}</div></td>
                  <td className="font-medium">{r.customer_name}</td>
                  <td>{fmtDate(r.doc_date)}</td>
                  <td className={r.overdue ? "text-red font-semibold" : ""}>{r.due_date ? fmtDate(r.due_date) : "—"}{r.overdue && " ⚠"}</td>
                  <td className="text-right">{fmt(r.grand_total)}</td>
                  <td className="text-right text-green">{Number(r.paid_total) ? fmt(r.paid_total) : "—"}</td>
                  <td className="text-right font-bold">{fmt(r.outstanding)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="text-center text-ink-soft py-8">ไม่มีลูกหนี้คงค้าง 🎉</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card p-5 h-fit">
          <h2 className="font-display font-bold mb-3">คงค้างรายลูกค้า</h2>
          <ul className="divide-y divide-line text-sm">{byCustomer.map((c) => <li key={c.name} className="py-2 flex justify-between gap-2"><span className="truncate">{c.name} <span className="text-xs text-ink-soft">({c.n})</span></span><b>{fmt(c.amount)}</b></li>)}</ul>
        </div>
      </div>
    </div>
  );
}
