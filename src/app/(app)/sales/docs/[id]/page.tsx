import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Pencil, ArrowRight, Ban, Trash2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DOC_META, STATUS_TH, STATUS_BADGE, CHANNEL_TH, NEXT_DOCS, type SalesDoc, type SalesDocItem } from "@/lib/sales/types";
import { issueSalesDoc, convertSalesDoc, settleReceipt, cancelSalesDoc, deleteDraft } from "../../actions";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; issued?: string; paid?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: doc }, { data: items }, { data: children }, { data: allocs }] = await Promise.all([
    supabase.from("sales_docs").select("*, companies(*), app_users(display_name)").eq("id", id).maybeSingle(),
    supabase.from("sales_doc_items").select("*").eq("doc_id", id).order("line_no"),
    supabase.from("sales_docs").select("id, doc_no, doc_type, status, grand_total, doc_date").eq("ref_doc_id", id).order("created_at"),
    supabase.from("sales_payments").select("amount, invoice:sales_docs!sales_payments_invoice_id_fkey(id, doc_no, grand_total)").eq("receipt_id", id),
  ]);
  if (!doc) notFound();
  const d = doc as SalesDoc;
  const meta = DOC_META[d.doc_type];
  const lines = (items ?? []) as SalesDocItem[];
  const isDraft = d.status === "draft";

  return (
    <div className="space-y-6">
      <div className="text-xs text-ink-soft"><Link href="/sales" className="hover:underline">ขาย</Link> › <Link href={`/sales/docs?type=${d.doc_type}`} className="hover:underline">{meta.th}</Link> › {d.doc_no}</div>
      <Header title={d.doc_no} sub={`${meta.th} · ${d.companies?.name_th ?? ""} · ${fmtDate(d.doc_date)}`} action={
        <div className="flex flex-wrap gap-2">
          <span className={`${STATUS_BADGE[d.status]} text-sm px-3 py-1`}>{STATUS_TH[d.status]}</span>
          <a href={`/print/sales/${id}`} target="_blank" className="btn-outline"><Printer size={16} /> พิมพ์ / PDF</a>
          {isDraft && <Link href={`/sales/docs/${id}/edit`} className="btn-outline"><Pencil size={16} /> แก้ไข</Link>}
        </div>
      } />
      {sp.created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกฉบับร่างแล้ว ตรวจสอบแล้วกด "ออกเอกสาร"</div>}
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {sp.issued && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ออกเอกสารแล้ว{d.stock_issue_id && " · ตัดสต็อกคลังใหญ่แล้ว"}</div>}
      {sp.paid && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกรับชำระแล้ว</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div className="card p-5 grid md:grid-cols-2 gap-4 text-sm" style={{ borderTopColor: meta.color, borderTopWidth: 4 }}>
            <div>
              <div className="text-xs text-ink-soft font-semibold mb-1">ลูกค้า</div>
              <div className="font-semibold">{d.customer_name}{d.customer_branch && <span className="font-normal text-ink-soft"> ({d.customer_branch})</span>}</div>
              {d.customer_address && <div className="text-ink-soft">{d.customer_address}</div>}
              {d.customer_tax_id && <div className="text-ink-soft">เลขประจำตัวผู้เสียภาษี {d.customer_tax_id}</div>}
            </div>
            <div className="space-y-1">
              <div><span className="text-ink-soft">ช่องทาง:</span> {CHANNEL_TH[d.channel]}</div>
              {d.due_date && <div><span className="text-ink-soft">ครบกำหนด:</span> {fmtDate(d.due_date)}</div>}
              {d.valid_until && <div><span className="text-ink-soft">ยืนราคาถึง:</span> {fmtDate(d.valid_until)}</div>}
              {d.po_no && <div><span className="text-ink-soft">PO:</span> {d.po_no}</div>}
              {d.ref_doc_no && <div><span className="text-ink-soft">อ้างอิง:</span> {d.ref_doc_id ? <Link href={`/sales/docs/${d.ref_doc_id}`} className="text-purple underline">{d.ref_doc_no}</Link> : d.ref_doc_no}</div>}
              {d.seller_name && <div><span className="text-ink-soft">ผู้ขาย:</span> {d.seller_name}</div>}
              {d.stock_issue_id && <div><span className="text-ink-soft">ใบเบิกคลัง:</span> <Link href={`/stock/issues/${d.stock_issue_id}`} className="text-purple underline">ดู</Link></div>}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>รายละเอียด</th><th className="text-right">จำนวน</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">ส่วนลด</th><th className="text-right">ยอดรวม</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}><td className="text-ink-soft">{l.line_no}</td><td className="whitespace-pre-wrap">{l.description}</td><td className="text-right">{Number(l.qty).toLocaleString()} {l.unit}</td><td className="text-right">{fmt(l.unit_price)}</td><td className="text-right">{Number(l.discount_pct) > 0 ? `${l.discount_pct}%` : "—"}</td><td className="text-right font-semibold">{fmt(l.amount)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="p-5 ml-auto max-w-sm text-sm space-y-1">
              <R l="รวมเป็นเงิน" v={d.subtotal} />
              {Number(d.discount_total) > 0 && <R l={`ส่วนลด${Number(d.discount_pct) > 0 ? ` ${d.discount_pct}%` : ""}`} v={-d.discount_total} />}
              {Number(d.deposit_amount) > 0 && <R l={`หักเงินมัดจำ ${d.deposit_ref ?? ""}`} v={-d.deposit_amount} />}
              {d.vat_mode !== "none" && <><R l={d.vat_mode === "inclusive" ? "ราคาไม่รวมภาษีมูลค่าเพิ่ม" : "จำนวนเงินหลังหักส่วนลด"} v={d.net_before_vat} /><R l="ภาษีมูลค่าเพิ่ม 7%" v={d.vat_amount} /></>}
              <div className="flex justify-between font-bold text-base border-t border-line pt-2"><span>จำนวนเงินรวมทั้งสิ้น</span><span>฿{fmt(d.grand_total)}</span></div>
              {Number(d.wht_amount) > 0 && <><R l={`หัก ณ ที่จ่าย ${d.wht_pct}%`} v={-d.wht_amount} /><div className="flex justify-between font-semibold"><span>ยอดรับสุทธิ</span><span>฿{fmt(Number(d.grand_total) - Number(d.wht_amount))}</span></div></>}
              {Number(d.paid_total) > 0 && d.doc_type !== "receipt" && <div className="flex justify-between text-green"><span>รับชำระแล้ว</span><span>{fmt(d.paid_total)}</span></div>}
            </div>
          </div>

          {(d.notes || d.internal_note) && (
            <div className="card p-5 text-sm space-y-2">
              {d.notes && <div><span className="text-ink-soft">หมายเหตุ:</span> <span className="whitespace-pre-wrap">{d.notes}</span></div>}
              {d.internal_note && <div className="text-ink-soft"><span>บันทึกภายใน:</span> {d.internal_note}</div>}
            </div>
          )}

          {(children?.length ?? 0) > 0 && (
            <div className="card p-5 text-sm">
              <div className="font-semibold mb-2">เอกสารที่ต่อจากใบนี้</div>
              <ul className="divide-y divide-line">{children!.map((c) => <li key={c.id} className="py-2 flex justify-between"><Link href={`/sales/docs/${c.id}`} className="text-purple underline">{c.doc_no} · {DOC_META[c.doc_type as keyof typeof DOC_META].th}</Link><span>{fmt(c.grand_total)} · <span className={STATUS_BADGE[c.status as keyof typeof STATUS_BADGE]}>{STATUS_TH[c.status as keyof typeof STATUS_TH]}</span></span></li>)}</ul>
            </div>
          )}
          {(allocs?.length ?? 0) > 0 && (
            <div className="card p-5 text-sm">
              <div className="font-semibold mb-2">รับชำระสำหรับ</div>
              <ul className="divide-y divide-line">{allocs!.map((a, i) => { const inv = a.invoice as unknown as { id: string; doc_no: string; grand_total: number } | null; return <li key={i} className="py-2 flex justify-between"><Link href={`/sales/docs/${inv?.id}`} className="text-purple underline">{inv?.doc_no}</Link><span>{fmt(a.amount)}</span></li>; })}</ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="font-display font-bold">ดำเนินการ</h2>
            {isDraft && <form action={issueSalesDoc.bind(null, id)}><button className="btn-primary w-full">ออกเอกสาร{d.deduct_stock && (d.doc_type === "invoice" || d.doc_type === "temp_delivery") ? " + ตัดสต็อก" : ""}</button></form>}
            {!isDraft && d.status !== "cancelled" && NEXT_DOCS[d.doc_type].length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-ink-soft font-semibold">สร้างเอกสารต่อ</div>
                {NEXT_DOCS[d.doc_type].map((t) => (
                  <form key={t} action={convertSalesDoc.bind(null, id, t)} className="space-y-1">
                    {(t === "invoice" || t === "temp_delivery") && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="deduct_stock" defaultChecked className="accent-purple" /> ตัดสต็อกเมื่อออก</label>}
                    <button className="btn-outline w-full justify-between"><span>{DOC_META[t].th}</span><ArrowRight size={14} /></button>
                  </form>
                ))}
              </div>
            )}
            {d.doc_type === "receipt" && d.status !== "paid" && d.status !== "cancelled" && (
              <form action={settleReceipt.bind(null, id)} className="space-y-2 pt-2 border-t border-line">
                <div className="text-xs text-ink-soft font-semibold">บันทึกรับเงิน</div>
                <select name="payment_method" className="input"><option>โอน</option><option>เงินสด</option><option>เช็ค</option><option>บัตรเครดิต</option><option>หักจากแพลตฟอร์ม</option></select>
                <input name="payment_date" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
                <input name="payment_ref" className="input" placeholder="เลขอ้างอิง / ธนาคาร" />
                <button className="btn-primary w-full">รับเงินแล้ว{isDraft && " (ออกใบเสร็จด้วย)"}</button>
              </form>
            )}
            {d.status !== "cancelled" && !isDraft && (
              <form action={cancelSalesDoc.bind(null, id)} className="pt-2 border-t border-line space-y-1">
                <input name="reason" className="input" placeholder="เหตุผลยกเลิก" />
                <button className="btn-ghost w-full text-red"><Ban size={14} /> ยกเลิกเอกสาร</button>
              </form>
            )}
            {isDraft && <form action={deleteDraft.bind(null, id, d.doc_type)}><button className="btn-ghost w-full text-ink-soft"><Trash2 size={14} /> ลบฉบับร่าง</button></form>}
          </div>
          <div className="card p-5 text-xs text-ink-soft space-y-1">
            <div>สร้างโดย {d.app_users?.display_name ?? "—"} · {fmtDateTime(d.created_at)}</div>
            {d.payment_date && <div>รับเงิน {fmtDate(d.payment_date)} · {d.payment_method} {d.payment_ref}</div>}
            {d.source !== "system" && <div>ที่มา: {d.source}</div>}
            {session.isAdmin && <div>บริษัท: {d.companies?.code}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function R({ l, v }: { l: string; v: number }) {
  return <div className="flex justify-between"><span className="text-ink-soft">{l}</span><span>{fmt(v)}</span></div>;
}
