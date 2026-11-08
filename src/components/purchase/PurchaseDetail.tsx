import Link from "next/link";
import { Pencil, Printer, CheckCircle2, XCircle, Send, PackageCheck, Receipt, ArrowRight } from "lucide-react";
import type { SessionInfo } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { PSTATUS_TH, PSTATUS_BADGE, type PurchaseDoc, type PurchaseItem, type PurchaseReceipt } from "@/lib/purchase/types";
import type { ExpenseCategory } from "@/lib/expenses/types";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { submitPurchaseRequest, reviewPurchaseRequest, convertPrToPo, issuePo, receivePo, expenseFromPo, cancelPurchaseDoc } from "@/app/(app)/purchase/actions";
import { todayBkk } from "@/lib/today";

const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export function PurchaseDetail({ d, items, receipts, derived: children, session, categories, flash }: {
  d: PurchaseDoc & { companies: { code: string; name_th: string }; creator: { email: string } | null; approver: { email: string } | null; expenses?: { exp_no: string; status: string } | null };
  items: PurchaseItem[]; receipts: PurchaseReceipt[]; derived: { id: string; doc_no: string; status: string }[]; session: SessionInfo; categories: ExpenseCategory[];
  flash: { error?: string; created?: string; saved?: string; submitted?: string; reviewed?: string; issued?: string; received?: string; cancelled?: string };
}) {
  const isPo = d.doc_type === "po";
  const base = isPo ? "/purchase/orders" : "/purchase/requests";
  const mine = d.created_by === session.appUser.id;
  const editable = ["draft", "pending", "rejected"].includes(d.status) && (session.isAdmin || mine);
  const canReceive = isPo && ["sent", "partial", "draft"].includes(d.status);
  const remaining = items.reduce((a, i) => a + Math.max(0, Number(i.qty) - Number(i.received_qty)), 0);
  const today = todayBkk();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3"><h1 className="font-display text-2xl font-bold">{d.doc_no}</h1><span className={`${PSTATUS_BADGE[d.status]} text-sm`}>{PSTATUS_TH[d.status]}</span></div>
          <div className="text-sm text-ink-soft mt-1">{isPo ? "ใบสั่งซื้อ" : "ใบขอซื้อภายใน"} · {d.companies.name_th} · สร้างโดย {d.creator?.email ?? "—"} · {fmtDateTime(d.created_at)}{d.ref_doc_no && <> · จาก <Link href={`/purchase/requests/${d.ref_doc_id}`} className="text-purple underline">{d.ref_doc_no}</Link></>}</div>
        </div>
        <div className="flex gap-2">
          {editable && <Link href={`${base}/${d.id}/edit`} className="btn-outline"><Pencil size={16} /> แก้ไข</Link>}
          <a href={`/print/purchase/${d.id}`} target="_blank" className="btn-outline"><Printer size={16} /> พิมพ์ / PDF</a>
        </div>
      </div>
      {flash.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{flash.error}</div>}
      {flash.created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">สร้างเอกสารแล้ว{!isPo && d.status === "pending" ? " — รอผู้บริหารอนุมัติ" : ""}</div>}
      {flash.reviewed && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกผลการพิจารณาแล้ว</div>}
      {flash.issued && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ส่งใบสั่งซื้อแล้ว — พิมพ์/ส่ง PDF ให้ซัพพลายเออร์ได้</div>}
      {flash.received && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">รับของแล้ว{flash.received !== "ok" && <> — ใบรับเข้าคลัง <b>{flash.received}</b></>}</div>}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-xs text-ink-soft">ซัพพลายเออร์ / ผู้จำหน่าย</div><div className="font-display text-lg font-bold">{d.supplier_name ?? "—"}</div>
                <div className="text-xs text-ink-soft">{d.supplier_tax_id && `เลขผู้เสียภาษี ${d.supplier_tax_id}`}{d.supplier_branch && ` · ${d.supplier_branch}`}</div>{d.supplier_address && <div className="text-xs text-ink-soft">{d.supplier_address}</div>}</div>
              <dl className="grid grid-cols-2 gap-2">
                <div><dt className="text-xs text-ink-soft">วันที่</dt><dd className="font-medium">{fmtDate(d.doc_date)}</dd></div>
                <div><dt className="text-xs text-ink-soft">{isPo ? "กำหนดส่ง" : "ต้องการภายใน"}</dt><dd className="font-medium">{d.need_by ? fmtDate(d.need_by) : "—"}</dd></div>
                <div><dt className="text-xs text-ink-soft">ผู้สั่งซื้อ</dt><dd className="font-medium">{d.buyer_name ?? "—"}</dd></div>
                <div><dt className="text-xs text-ink-soft">VAT</dt><dd className="font-medium">{d.vat_mode === "exclusive" ? "ก่อน VAT +7%" : d.vat_mode === "inclusive" ? "รวม VAT" : "ไม่มี"}</dd></div>
              </dl>
            </div>
            {d.purpose && <p className="text-sm"><b>วัตถุประสงค์:</b> {d.purpose}</p>}
            {d.notes && <p className="text-sm whitespace-pre-wrap text-ink-soft">{d.notes}</p>}
            {d.review_note && <p className="text-sm rounded-lg bg-cream px-3 py-2"><b>ผู้บริหาร:</b> {d.review_note}{d.approver && <span className="text-xs text-ink-soft"> — {d.approver.email} {d.approved_at && fmtDateTime(d.approved_at)}</span>}</p>}
          </div>

          <div className="card overflow-x-auto"><table className="tbl">
            <thead><tr><th>#</th><th>รายการ</th><th className="text-right">จำนวน</th>{isPo && <th className="text-right">รับแล้ว</th>}<th className="text-right">ราคา/หน่วย</th><th className="text-right">รวม</th></tr></thead>
            <tbody>{items.map((it) => <tr key={it.id}><td className="text-ink-soft">{it.line_no}</td>
              <td><div className="font-medium">{it.description}</div>{it.detail && <div className="text-xs text-ink-soft whitespace-pre-wrap">{it.detail}</div>}{(it.product_id || it.material_id) && <div className="text-[10px] text-green">✓ {it.product_id ? "สินค้า" : "วัสดุ"}ในคลัง</div>}</td>
              <td className="text-right">{Number(it.qty)} {it.unit}</td>{isPo && <td className={`text-right ${Number(it.received_qty) >= Number(it.qty) ? "text-green" : Number(it.received_qty) > 0 ? "text-[#8a6a00]" : "text-ink-soft"}`}>{Number(it.received_qty)}</td>}
              <td className="text-right">{fmt(it.unit_price)}{Number(it.discount_pct) > 0 && <div className="text-[10px] text-ink-soft">ลด {it.discount_pct}%</div>}</td><td className="text-right font-semibold">{fmt(it.amount)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={isPo ? 5 : 4} className="text-right text-ink-soft">รวม</td><td className="text-right">{fmt(d.subtotal)}</td></tr>
              {(Number(d.discount_pct) > 0 || Number(d.discount_amount) > 0) && <tr><td colSpan={isPo ? 5 : 4} className="text-right text-ink-soft">ส่วนลดท้ายบิล</td><td className="text-right text-red">−{fmt(Number(d.discount_amount) + Math.round(Number(d.subtotal) * Number(d.discount_pct)) / 100)}</td></tr>}
              {d.vat_mode !== "none" && <><tr><td colSpan={isPo ? 5 : 4} className="text-right text-ink-soft">ก่อน VAT</td><td className="text-right">{fmt(d.net_before_vat)}</td></tr><tr><td colSpan={isPo ? 5 : 4} className="text-right text-ink-soft">VAT 7%</td><td className="text-right">{fmt(d.vat_amount)}</td></tr></>}
              <tr className="font-bold"><td colSpan={isPo ? 5 : 4} className="text-right">รวมทั้งสิ้น</td><td className="text-right text-purple text-lg">{fmt(d.grand_total)}</td></tr></tfoot>
          </table></div>

          {isPo && receipts.length > 0 && (
            <div className="card p-5"><h3 className="font-display font-bold mb-2">ประวัติการรับของ</h3>
              <ul className="text-sm space-y-1">{receipts.map((r) => <li key={r.id} className="flex flex-wrap gap-2"><span>{fmtDate(r.received_at)}</span><span className="text-ink-soft">{r.lines.reduce((a, l) => a + Number(l.qty), 0)} หน่วย</span>{r.stock_receipt_id && <Link href={`/stock/receipts/${r.stock_receipt_id}`} className="text-purple underline text-xs">ใบรับเข้าคลัง</Link>}{r.note && <span className="text-xs text-ink-soft">· {r.note}</span>}</li>)}</ul></div>
          )}
        </div>

        <div className="space-y-4">
          {/* PR workflow */}
          {!isPo && d.status === "draft" && (session.isAdmin || mine) && <form action={submitPurchaseRequest.bind(null, d.id)}><button className="btn-primary w-full"><Send size={16} /> ส่งขออนุมัติ</button></form>}
          {!isPo && session.isAdmin && ["pending", "draft"].includes(d.status) && (
            <form className="card p-5 space-y-3"><h3 className="font-display font-bold">พิจารณาใบขอซื้อ</h3>
              <input name="note" className="input" placeholder="หมายเหตุ / เงื่อนไข" />
              <div className="flex gap-2"><button formAction={reviewPurchaseRequest.bind(null, d.id, "approved")} className="btn-primary"><CheckCircle2 size={16} /> อนุมัติ</button><button formAction={reviewPurchaseRequest.bind(null, d.id, "rejected")} className="btn-danger"><XCircle size={16} /> ไม่อนุมัติ</button></div></form>
          )}
          {!isPo && d.status === "approved" && (
            <form action={convertPrToPo.bind(null, d.id)} className="card p-5 space-y-3"><h3 className="font-display font-bold">เปิดใบสั่งซื้อจากใบนี้</h3>
              <div><label className="label">วันที่ PO</label><input type="date" name="doc_date" defaultValue={today} className="input" /></div>
              <button className="btn-primary w-full"><ArrowRight size={16} /> สร้าง PO (ร่าง)</button>
              <p className="text-[11px] text-ink-soft">คัดลอกรายการ/ราคา ไปแก้ราคาที่ตกลงกับซัพพลายเออร์ได้ก่อนส่ง</p></form>
          )}
          {!isPo && children.length > 0 && <div className="card p-5 text-sm"><div className="font-display font-bold mb-1">ใบสั่งซื้อที่เปิดจากใบนี้</div>{children.map((c) => <div key={c.id}><Link href={`/purchase/orders/${c.id}`} className="text-purple underline font-mono text-xs">{c.doc_no}</Link> <span className="text-xs text-ink-soft">{PSTATUS_TH[c.status as keyof typeof PSTATUS_TH]}</span></div>)}</div>}

          {/* PO workflow */}
          {isPo && d.status === "draft" && (session.isAdmin || mine) && <form action={issuePo.bind(null, d.id)}><button className="btn-primary w-full"><Send size={16} /> ยืนยันส่งซัพพลายเออร์</button><p className="text-[11px] text-ink-soft mt-1 text-center">ล็อกการแก้ไข · จากนั้นพิมพ์/ส่ง PDF</p></form>}
          {canReceive && remaining > 0 && (
            <form action={receivePo.bind(null, d.id)} className="card p-5 space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><PackageCheck size={18} className="text-green" /> รับของ</h3>
              <div className="grid grid-cols-2 gap-2"><div><label className="label">วันที่รับ</label><input type="date" name="received_at" defaultValue={today} className="input" /></div><div><label className="label">เลขที่ใบส่งของ</label><input name="supplier_doc_no" className="input" placeholder="ของซัพพลายเออร์" /></div></div>
              <div className="space-y-2">{items.filter((i) => Number(i.received_qty) < Number(i.qty)).map((i) => (
                <div key={i.id} className="grid grid-cols-[1fr_84px_84px] gap-2 items-center text-sm"><input type="hidden" name="item_id" value={i.id} />
                  <div className="truncate">{i.description}<div className="text-[10px] text-ink-soft">ค้าง {Number(i.qty) - Number(i.received_qty)} {i.unit}</div></div>
                  <input type="number" name="recv_qty" step="0.01" min={0} max={Number(i.qty) - Number(i.received_qty)} defaultValue={Number(i.qty) - Number(i.received_qty)} className="input !py-1 text-right" />
                  <select name="condition" className="input !py-1 text-xs"><option value="good">ดี</option><option value="defect">ชำรุด</option></select></div>))}</div>
              <input name="note" className="input" placeholder="หมายเหตุ" />
              <button className="btn-primary w-full">บันทึกรับของเข้าคลัง</button>
              <p className="text-[11px] text-ink-soft">สินค้า → ใบรับเข้าคลังใหญ่ (RC) · ลายผ้า/แพคเกจจิ้ง → ประวัติวัสดุ · รายการพิมพ์เองไม่เข้าคลัง</p></form>
          )}
          {isPo && !d.expense_id && !["draft", "cancelled"].includes(d.status) && (
            <form action={expenseFromPo.bind(null, d.id)} className="card p-5 space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><Receipt size={18} className="text-purple" /> สร้างบิลค่าใช้จ่าย</h3>
              <div className="grid grid-cols-2 gap-2"><div><label className="label">เลขที่บิล/ใบกำกับ</label><input name="bill_no" className="input" placeholder="จากซัพพลายเออร์" /></div><div><label className="label">วันที่บิล</label><input type="date" name="bill_date" defaultValue={today} className="input" /></div></div>
              <div className="grid grid-cols-2 gap-2"><div><label className="label">หมวด</label><select name="category_id" className="input"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="label">หัก ณ ที่จ่าย %</label><select name="wht_pct" className="input">{[0, 1, 2, 3, 5].map((w) => <option key={w} value={w}>{w === 0 ? "ไม่หัก" : `${w}%`}</option>)}</select></div></div>
              <button className="btn-outline w-full">สร้างรายการค่าใช้จ่าย (รออนุมัติ) {fmt(d.grand_total)}</button></form>
          )}
          {isPo && d.expense_id && <div className="card p-5 text-sm"><div className="text-xs text-ink-soft">บิลค่าใช้จ่าย</div><Link href={`/expenses/${d.expense_id}`} className="text-purple underline font-mono">{d.expenses?.exp_no ?? "เปิดดู"}</Link> <span className="text-xs text-ink-soft">{d.expenses?.status}</span></div>}

          {!["cancelled", "received", "closed"].includes(d.status) && (session.isAdmin || mine) && (
            <ConfirmDelete action={cancelPurchaseDoc.bind(null, d.doc_type, d.id, new FormData())} label="ยกเลิกเอกสาร" warning={isPo ? "ใบสั่งซื้อนี้จะถูกยกเลิก (ใบขอซื้อต้นทางกลับเป็น อนุมัติแล้ว)" : "ใบขอซื้อนี้จะถูกยกเลิก"} />
          )}
        </div>
      </div>
    </div>
  );
}
