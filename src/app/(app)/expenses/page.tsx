import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { STATUS_TH, STATUS_BADGE, whtMissing, type Expense, type ExpenseStatus } from "@/lib/expenses/types";

import { monthBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const TABS: { key: string; label: string }[] = [{ key: "", label: "ทั้งหมด" }, { key: "pending", label: "รออนุมัติ" }, { key: "approved", label: "รอจ่าย" }, { key: "paid", label: "จ่ายแล้ว" }, { key: "rejected", label: "ไม่อนุมัติ" }, { key: "draft", label: "ร่าง" }, { key: "wht_missing", label: "⚠ หัก ณ ที่จ่ายข้อมูลไม่ครบ" }];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; month?: string; deleted?: string }> }) {
  const { status = "", q = "", month, deleted } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const ym = month ?? monthBkk();
  const from = `${ym}-01`; const to = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).toISOString().slice(0, 10);
  let query = supabase.from("expenses").select("*, expense_categories(name), companies(code)").order("bill_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (status === "wht_missing") query = query.gt("wht_amount", 0).neq("status", "cancelled").neq("status", "rejected");
  else if (status) query = query.eq("status", status);
  if (q) query = query.or(`supplier_name.ilike.%${q}%,bill_no.ilike.%${q}%,exp_no.ilike.%${q}%,description.ilike.%${q}%`);
  const [{ data: rows }, { data: sum }] = await Promise.all([query, supabase.rpc("expense_summary", { p_from: from, p_to: to })]);
  type Row = Expense & { expense_categories: { name: string } | null; companies: { code: string } | null };
  const missOf = (r: Row) => (Number(r.wht_amount) > 0 ? whtMissing({ name: r.supplier_name, tax_id: r.supplier_tax_id, address: r.supplier_address }) : []);
  const list = ((rows ?? []) as Row[]).filter((r) => status !== "wht_missing" || missOf(r).length > 0);

  return (
    <div className="space-y-6">
      <Header title="ค่าใช้จ่าย / เจ้าหนี้" sub={session.isAdmin ? "บิลซัพพลายเออร์ทั้งบริษัท · อนุมัติ · รอบจ่าย 1 และ 15" : "บิลที่คุณบันทึก — ผู้บริหารเป็นผู้อนุมัติและจ่าย"}
        action={<div className="flex gap-2"><Link href="/expenses/quick" className="btn-outline">📷 บันทึกด่วน</Link><Link href="/expenses/new" className="btn-primary"><Plus size={16} /> บันทึกบิลใหม่</Link></div>} />
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบรายการค่าใช้จ่ายแล้ว</div>}
      {sum && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label={`รออนุมัติ ${sum.pending_count} ใบ`} value={`฿${fmt(sum.pending_amount)}`} tone="yellow" href="/expenses?status=pending" />
          <Stat label={`รอจ่าย ${sum.approved_count} ใบ`} value={`฿${fmt(sum.approved_amount)}`} tone="teal" href="/expenses/payables" />
          <Stat label={`จ่ายแล้ว ${ym}`} value={`฿${fmt(sum.paid_amount)}`} tone="purple" />
          <Stat label={`VAT ซื้อ ${ym}`} value={`฿${fmt(sum.vat_in)}`} tone="coral" />
          <Stat label={`หัก ณ ที่จ่าย ${ym}`} value={`฿${fmt(sum.wht_total)}`} tone="coral" href="/expenses/wht" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => <Link key={t.key} href={`/expenses?status=${t.key}${q ? `&q=${q}` : ""}`} className={`px-3 py-1.5 rounded-full text-sm ${status === t.key ? "bg-purple text-white" : "bg-white border border-line hover:bg-cream"}`}>{t.label}</Link>)}
        <form className="ml-auto"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="ค้นหาซัพพลายเออร์ / เลขบิล…" className="input w-64" /></form>
      </div>
      <div className="card overflow-x-auto lg:overflow-x-visible">
        <table className="tbl text-[13px]">
          <thead><tr><th>เลขที่ / วันที่บิล</th><th>ซัพพลายเออร์</th><th>หมวด</th><th className="text-right">ยอดบิล</th><th className="text-right">หัก ณ<br />ที่จ่าย</th><th className="text-right">จ่ายจริง</th><th>รอบจ่าย</th><th>วันที่จ่าย</th><th>สถานะ</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/expenses/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.exp_no}</Link><div className="text-[11px] whitespace-nowrap">{fmtDate(r.bill_date)}</div><div className="text-[10px] text-ink-soft">{r.companies?.code}{r.bill_no ? ` · บิล ${r.bill_no}` : ""}</div></td>
                <td><div className="font-medium">{r.supplier_name}</div>{r.description && <div className="text-xs text-ink-soft truncate max-w-[220px]">{r.description}</div>}</td>
                <td className="text-xs max-w-[130px]">{r.expense_categories?.name ?? "—"}</td>
                <td className="text-right">{fmt(r.grand_total)}</td>
                <td className="text-right text-red">{Number(r.wht_amount) ? (Number(r.wht_payer ?? 1) === 1 ? `−${fmt(r.wht_amount)}` : <span className="text-[#7a4a00]">{fmt(r.wht_amount)}<span className="block text-[10px]">บริษัทออกให้</span></span>) : "—"}{missOf(r).length > 0 && <Link href={`/expenses/${r.id}/edit`} title={`ขาด: ${missOf(r).join(", ")}`} className="block mt-0.5 text-[10px] font-semibold text-[#b45309] bg-yellow/25 rounded px-1 whitespace-nowrap">⚠ ข้อมูลไม่ครบ</Link>}</td>
                <td className="text-right font-semibold">{fmt(r.net_pay)}</td>
                <td className="text-xs whitespace-nowrap">{r.pay_round ? fmtDate(r.pay_round) : "—"}</td>
                <td className="text-xs whitespace-nowrap">{r.paid_date ? <span className="text-green font-medium">{fmtDate(r.paid_date)}</span> : "—"}</td>
                <td><span className={STATUS_BADGE[r.status as ExpenseStatus]}>{STATUS_TH[r.status as ExpenseStatus]}</span></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={9} className="text-center text-ink-soft py-10">{status === "wht_missing" ? "ข้อมูลหัก ณ ที่จ่ายครบทุกบิลแล้ว 👍" : "ยังไม่มีรายการ — กด “บันทึกบิลใหม่” แล้วถ่ายรูปบิลได้เลย"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
