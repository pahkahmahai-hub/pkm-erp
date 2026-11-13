import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { PAY_METHODS, type Expense } from "@/lib/expenses/types";
import { payExpense } from "../actions";
import { PaySlipProvider, PaySelect, PaySlipButton } from "@/components/expenses/PaySlip";

import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function Payables() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").select("*, companies(code), expense_categories(name)").eq("status", "approved").order("pay_round", { ascending: true, nullsFirst: false }).order("supplier_name");
  type Row = Expense & { companies: { code: string }; expense_categories: { name: string } | null };
  const rows = (data ?? []) as Row[];
  const groups = Object.entries(rows.reduce<Record<string, Row[]>>((acc, r) => { const k = r.pay_round ?? "ไม่ระบุรอบ"; (acc[k] ??= []).push(r); return acc; }, {}));
  const total = rows.reduce((a, r) => a + Number(r.net_pay), 0);
  const today = todayBkk();

  return (
    <PaySlipProvider>
    <div className="space-y-6 pb-20">
      <Header title="เตรียมจ่าย (เจ้าหนี้ที่อนุมัติแล้ว)" sub={`${rows.length} ใบ · รวม ฿${fmt(total)} · จัดกลุ่มตามรอบจ่าย 1 / 15`} />
      {groups.map(([round, list]) => {
        const sum = list.reduce((a, r) => a + Number(r.net_pay), 0);
        const wht = list.reduce((a, r) => a + Number(r.wht_amount), 0);
        const overdue = round !== "ไม่ระบุรอบ" && round < today;
        return (
          <div key={round} className="card overflow-hidden">
            <div className={`px-5 py-3 flex flex-wrap items-center justify-between gap-2 ${overdue ? "bg-red/10" : "bg-cream/70"}`}>
              <div className="font-display font-bold">รอบจ่าย {round === "ไม่ระบุรอบ" ? round : fmtDate(round)} {overdue && <span className="badge-rejected ml-2">เลยรอบแล้ว</span>}</div>
              <div className="text-sm">{list.length} ใบ · จ่ายรวม <b>฿{fmt(sum)}</b>{wht > 0 && <span className="text-xs text-ink-soft"> · หัก ณ ที่จ่ายรวม {fmt(wht)}</span>}</div>
            </div>
            <table className="tbl">
              <thead><tr><th className="w-8"></th><th>เลขที่</th><th>ซัพพลายเออร์</th><th>บิล</th><th className="text-right">ยอดบิล</th><th className="text-right">หัก ณ ที่จ่าย</th><th className="text-right">จ่ายจริง</th><th className="w-[330px]">บันทึกจ่าย</th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.id}>
                  <td><PaySelect s={{ id: r.id, no: r.exp_no, supplier: r.supplier_name, net: Number(r.net_pay) }} /></td>
                  <td><Link href={`/expenses/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.exp_no}</Link><div className="text-[10px] text-ink-soft">{r.companies.code} · {r.expense_categories?.name ?? ""}</div></td>
                  <td className="font-medium">{r.supplier_name}{r.description && <div className="text-xs text-ink-soft truncate max-w-[220px]">{r.description}</div>}</td>
                  <td className="text-xs">{r.bill_no ?? "—"}<div className="text-ink-soft">{fmtDate(r.bill_date)}</div></td>
                  <td className="text-right">{fmt(r.grand_total)}</td>
                  <td className="text-right text-red">{Number(r.wht_amount) ? `−${fmt(r.wht_amount)}` : "—"}</td>
                  <td className="text-right font-bold">{fmt(r.net_pay)}</td>
                  <td>
                    <form action={payExpense.bind(null, r.id)} className="flex flex-wrap gap-1.5 items-center">
                      <input type="hidden" name="back" value="/expenses/payables" />
                      <input type="date" name="paid_date" defaultValue={today} className="input !py-1 !text-xs w-[130px]" />
                      <select name="paid_method" className="input !py-1 !text-xs w-[84px]">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                      <input name="paid_ref" placeholder="อ้างอิง" className="input !py-1 !text-xs w-[90px]" />
                      <button className="btn-outline !py-1 !px-2.5 !text-xs">จ่ายแล้ว</button>
                    </form>
                    <div className="mt-1"><PaySlipButton s={{ id: r.id, no: r.exp_no, supplier: r.supplier_name, net: Number(r.net_pay) }} /></div>
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        );
      })}
      {!rows.length && <div className="card p-10 text-center text-ink-soft">ไม่มีรายการรอจ่าย 🎉</div>}
    </div>
    </PaySlipProvider>
  );
}
