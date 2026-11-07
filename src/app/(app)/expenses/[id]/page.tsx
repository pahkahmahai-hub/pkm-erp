import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer, CheckCircle2, XCircle, Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { STATUS_TH, STATUS_BADGE, PAY_METHODS, nextPayRound, type Expense, type ExpenseItem, type ExpenseFile, type WhtCertificate } from "@/lib/expenses/types";
import { reviewExpense, payExpense, cancelExpense, signExpenseFiles } from "../actions";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";

import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function ExpenseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; created?: string; paid?: string }> }) {
  const { id } = await params; const { error, created, paid } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: e }, { data: items }, { data: files }, { data: cert }] = await Promise.all([
    supabase.from("expenses").select("*, expense_categories(name, wht_income_type), companies(code, name_th), approver:app_users!expenses_approved_by_fkey(email), creator:app_users!expenses_created_by_fkey(email)").eq("id", id).maybeSingle(),
    supabase.from("expense_items").select("*").eq("expense_id", id).order("line_no"),
    supabase.from("expense_files").select("*").eq("expense_id", id),
    supabase.from("wht_certificates").select("*").eq("expense_id", id).maybeSingle(),
  ]);
  if (!e) notFound();
  type Row = Expense & { expense_categories: { name: string; wht_income_type: string | null } | null; companies: { code: string; name_th: string }; approver: { email: string } | null; creator: { email: string } | null };
  const x = e as Row;
  const fl = (files ?? []) as ExpenseFile[];
  const urls = await signExpenseFiles(fl.map((f) => f.path));
  const editable = ["draft", "pending", "rejected"].includes(x.status) && (session.isAdmin || x.created_by === session.appUser.id);
  const wc = cert as WhtCertificate | null;

  return (
    <div className="space-y-6">
      <Header title={`${x.exp_no}`} sub={`${x.companies.name_th} · บันทึกโดย ${x.creator?.email ?? "—"} · ${fmtDateTime(x.created_at)}`}
        action={<div className="flex gap-2">{editable && <Link href={`/expenses/${id}/edit`} className="btn-outline"><Pencil size={16} /> แก้ไข</Link>}{wc && <a href={`/print/wht/${wc.id}`} target="_blank" className="btn-outline"><Printer size={16} /> พิมพ์ 50 ทวิ</a>}</div>} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      {created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว — {x.status === "pending" ? "รอผู้บริหารอนุมัติ" : "ยังเป็นฉบับร่าง"}</div>}
      {paid && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกการจ่ายแล้ว{wc ? ` · ออกหนังสือรับรองหัก ณ ที่จ่าย ${wc.cert_no}` : ""}</div>}

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-4">
          {fl.map((f, i) => f.path.endsWith(".pdf")
            ? <a key={f.id} href={urls[i]} target="_blank" className="card block p-4 text-sm text-purple">📄 เปิดไฟล์ PDF</a>
            : /* eslint-disable-next-line @next/next/no-img-element */ <a key={f.id} href={urls[i]} target="_blank"><img src={urls[i]} alt="" className="w-full rounded-2xl border border-line" /></a>)}
          {!fl.length && <div className="card p-6 text-center text-sm text-ink-soft">ไม่มีรูปบิล</div>}
        </div>

        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="text-xs text-ink-soft">ซัพพลายเออร์ / ผู้รับเงิน</div><div className="font-display text-lg font-bold">{x.supplier_name}</div>
                <div className="text-xs text-ink-soft">{x.supplier_tax_id && `เลขผู้เสียภาษี ${x.supplier_tax_id}`}{x.supplier_branch && ` · สาขา ${x.supplier_branch}`} · {x.supplier_is_company ? "นิติบุคคล (ภ.ง.ด.53)" : "บุคคลธรรมดา (ภ.ง.ด.3)"}</div>
                {x.supplier_address && <div className="text-xs text-ink-soft">{x.supplier_address}</div>}</div>
              <span className={`${STATUS_BADGE[x.status]} text-sm`}>{STATUS_TH[x.status]}</span>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-xs text-ink-soft">เลขที่บิล</dt><dd className="font-medium">{x.bill_no ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-soft">วันที่บิล</dt><dd className="font-medium">{fmtDate(x.bill_date)}</dd></div>
              <div><dt className="text-xs text-ink-soft">หมวด</dt><dd className="font-medium">{x.expense_categories?.name ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-soft">รอบจ่าย</dt><dd className="font-medium">{x.pay_round ? fmtDate(x.pay_round) : "—"}</dd></div>
            </dl>
            {x.description && <p className="text-sm">{x.description}</p>}
            {x.review_note && <p className="text-sm rounded-lg bg-cream px-3 py-2"><b>ผู้บริหาร:</b> {x.review_note}{x.approver && <span className="text-xs text-ink-soft"> — {x.approver.email} {x.approved_at && fmtDateTime(x.approved_at)}</span>}</p>}
          </div>

          <div className="card overflow-x-auto">
            <table className="tbl"><thead><tr><th>#</th><th>รายการ</th><th className="text-right">จำนวน</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">จำนวนเงิน</th></tr></thead>
              <tbody>{((items ?? []) as ExpenseItem[]).map((it) => <tr key={it.id}><td className="text-ink-soft">{it.line_no}</td><td>{it.description}</td><td className="text-right">{Number(it.qty)} {it.unit ?? ""}</td><td className="text-right">{fmt(it.unit_price)}</td><td className="text-right font-semibold">{fmt(it.amount)}</td></tr>)}</tbody></table>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="card p-5 text-sm space-y-1.5">
              <R l="รวมรายการ" v={x.subtotal} />{Number(x.discount_amount) > 0 && <R l="ส่วนลด" v={-x.discount_amount} />}
              {x.vat_mode !== "none" && <><R l="มูลค่าก่อน VAT" v={x.net_before_vat} /><R l="VAT 7%" v={x.vat_amount} /></>}
              <R l="ยอดตามบิล" v={x.grand_total} bold />{Number(x.wht_pct) > 0 && <R l={`หัก ณ ที่จ่าย ${x.wht_pct}%`} v={-x.wht_amount} red />}
              <div className="border-t border-line pt-2 mt-2 flex justify-between items-baseline"><span className="font-semibold">ยอดจ่ายจริง</span><span className="font-display text-xl font-bold text-purple">{fmt(x.net_pay)}</span></div>
              {x.status === "paid" && <div className="text-xs text-green pt-2">จ่ายแล้ว {fmtDate(x.paid_date)} · {x.paid_method}{x.paid_ref ? ` · ${x.paid_ref}` : ""}</div>}
            </div>

            <div className="space-y-4">
              {session.isAdmin && ["pending", "draft"].includes(x.status) && (
                <div className="card p-5 space-y-3">
                  <h3 className="font-display font-bold">พิจารณา</h3>
                  <form className="space-y-3">
                    <div><label className="label">รอบจ่าย</label><input type="date" name="pay_round" defaultValue={x.pay_round ?? nextPayRound(x.bill_date)} className="input" /></div>
                    <div><label className="label">หมายเหตุ</label><input name="note" className="input" placeholder="เหตุผล / คำสั่งเพิ่มเติม" /></div>
                    <div className="flex gap-2"><button formAction={reviewExpense.bind(null, id, "approved")} className="btn-primary"><CheckCircle2 size={16} /> อนุมัติ</button><button formAction={reviewExpense.bind(null, id, "rejected")} className="btn-danger"><XCircle size={16} /> ไม่อนุมัติ</button></div>
                  </form>
                </div>
              )}
              {session.isAdmin && x.status === "approved" && (
                <form action={payExpense.bind(null, id)} className="card p-5 space-y-3">
                  <h3 className="font-display font-bold flex items-center gap-2"><Banknote size={18} className="text-green" /> บันทึกการจ่าย</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">วันที่จ่าย</label><input type="date" name="paid_date" defaultValue={todayBkk()} className="input" required /></div>
                    <div><label className="label">วิธี</label><select name="paid_method" className="input">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
                  </div>
                  <div><label className="label">อ้างอิง (เลขสลิป / ธนาคาร)</label><input name="paid_ref" className="input" /></div>
                  {Number(x.wht_amount) > 0 && <label className="text-xs flex items-center gap-2"><input type="checkbox" name="issue_wht" defaultChecked value="on" /> ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) {fmt(x.wht_amount)} บาท</label>}
                  <button className="btn-primary w-full">จ่ายแล้ว {fmt(x.net_pay)} บาท</button>
                </form>
              )}
              {!wc && x.status === "paid" && <Link href={`/expenses/wht/new?expense=${id}`} className="btn-outline w-full">ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</Link>}
              {wc && <div className="card p-5 text-sm space-y-1"><div className="font-display font-bold">หนังสือรับรองหัก ณ ที่จ่าย</div><div>{wc.cert_no} · {wc.form === "pnd53" ? "ภ.ง.ด.53" : "ภ.ง.ด.3"}</div><div className="text-xs text-ink-soft">{wc.income_type} · ฐาน {fmt(wc.income_amount)} · หัก {fmt(wc.wht_amount)}</div><a href={`/print/wht/${wc.id}`} target="_blank" className="text-purple text-xs underline">พิมพ์</a></div>}
              {x.status !== "cancelled" && (session.isAdmin || x.created_by === session.appUser.id) && x.status !== "paid" && (
                <ConfirmDelete action={cancelExpense.bind(null, id, new FormData())} label="ยกเลิกรายการ" warning="รายการนี้จะถูกยกเลิก ไม่นับเป็นค่าใช้จ่าย/เจ้าหนี้" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function R({ l, v, bold, red }: { l: string; v: number; bold?: boolean; red?: boolean }) {
  const n = Number(v);
  return <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${red ? "text-red" : ""}`}><span className="text-ink-soft">{l}</span><span>{n < 0 ? `−${fmt(-n)}` : fmt(n)}</span></div>;
}
