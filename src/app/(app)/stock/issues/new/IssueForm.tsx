"use client";

import { useState, useTransition } from "react";
import { FileUp, CheckCircle2, AlertCircle } from "lucide-react";
import { LineItemsEditor, type LineItem } from "@/components/stock/LineItemsEditor";
import { ContactPicker } from "@/components/stock/ContactPicker";
import { createIssue, parseFlowAccountPdf, parseGenericPdf } from "../../actions";
import type { Product, Contact } from "@/lib/stock/types";

type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "stock_qty" | "unit">;
type ContactLite = Pick<Contact, "id" | "name" | "code" | "tax_id">;

export function IssueForm({ products, customers }: { products: ProductLite[]; customers: ContactLite[] }) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [source, setSource] = useState<"manual" | "flowaccount_pdf" | "other_pdf">("manual");
  const [docNo, setDocNo] = useState("");
  const [customer, setCustomer] = useState<ContactLite | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [pdfInfo, setPdfInfo] = useState<{ ok: number; miss: { name: string; qty: number; barcode: string }[]; unmatched: string[]; customerName: string | null; generic?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const total = items.reduce((a, i) => a + i.qty, 0);
  const over = items.some((i) => i.qty > i.stock_qty);

  function onPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("pdf", f);
    start(async () => {
      try {
        const res = await parseFlowAccountPdf(fd);
        if ("error" in res) { setPdfError(res.error); return; }
        setPdfError(null);
        const next: LineItem[] = [];
        const miss: { name: string; qty: number; barcode: string }[] = [];
        for (const m of res.matched) {
          if (m.product) next.push({ key: crypto.randomUUID(), product_id: m.product.id, code: m.product.code, name: m.product.name, stock_qty: m.product.stock_qty, qty: m.qty, note: "" });
          else miss.push({ name: m.name, qty: m.qty, barcode: m.barcode });
        }
        setItems(next);
        setSource("flowaccount_pdf");
        setDocNo(res.doc.docNo ?? "");
        if (res.customer) { setCustomer(res.customer as ContactLite); setPickerKey((k) => k + 1); }
        setPdfInfo({ ok: next.length, miss, unmatched: res.doc.unmatched, customerName: res.doc.customerName });
      } catch (err) {
        alert((err as Error).message);
      }
    });
    e.target.value = "";
  }

  function onGenericPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("pdf", f);
    start(async () => {
      const res = await parseGenericPdf(fd);
      if ("error" in res) { setPdfError(res.error); return; }
      setPdfError(null);
      const next: LineItem[] = [];
      const miss: { name: string; qty: number; barcode: string }[] = [];
      for (const m of res.matched) {
        if (m.product) next.push({ key: crypto.randomUUID(), product_id: m.product.id, code: m.product.code, name: m.product.name, stock_qty: m.product.stock_qty, qty: m.qty, note: "" });
        else miss.push({ name: m.context, qty: m.qty, barcode: m.barcode });
      }
      setItems(next);
      setSource("other_pdf");
      setDocNo(res.docNo ?? "");
      setPdfInfo({ ok: next.length, miss, unmatched: [], customerName: null, generic: true });
    });
    e.target.value = "";
  }

  return (
    <form action={createIssue} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ product_id: i.product_id, qty: i.qty, note: i.note ?? "" })))} />
      <input type="hidden" name="source" value={source} />

      <div className="card p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-outline cursor-pointer">
            <FileUp size={16} /> {pending ? "กำลังอ่าน PDF…" : "อัปโหลด PDF จาก FlowAccount"}
            <input type="file" accept="application/pdf" onChange={onPdf} className="hidden" disabled={pending} />
          </label>
          <label className="btn-outline cursor-pointer">
            <FileUp size={16} /> {pending ? "กำลังอ่าน PDF…" : "อัปโหลด PDF อื่นที่มีบาร์โค้ด"}
            <input type="file" accept="application/pdf" onChange={onGenericPdf} className="hidden" disabled={pending} />
          </label>
        </div>
        <p className="text-xs text-ink-soft">FlowAccount: อ่านเลขที่เอกสาร ลูกค้า และรายการครบ · PDF อื่น (PO ห้าง, ใบส่งของระบบอื่น): อ่านบาร์โค้ด + จำนวน แล้วให้ตรวจก่อนบันทึก</p>
        {pdfError && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{pdfError}</div>}
        {pdfInfo && (
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2 text-green"><CheckCircle2 size={16} /> จับคู่ได้ {pdfInfo.ok} รายการ{pdfInfo.customerName ? ` · ลูกค้าในเอกสาร: ${pdfInfo.customerName}` : ""}</div>
            {pdfInfo.generic && <div className="rounded-xl bg-yellow/15 p-3 text-[#8a6a00]"><b>กรุณาตรวจจำนวนทุกบรรทัดก่อนบันทึก</b> — เอกสารรูปแบบนี้ระบบเดาจำนวนจากตัวเลขในบรรทัดเดียวกับบาร์โค้ด และต้องเลือกลูกค้าเอง</div>}
            {pdfInfo.miss.length > 0 && (
              <div className="rounded-xl bg-yellow/15 p-3">
                <div className="flex items-center gap-2 text-[#8a6a00] font-semibold"><AlertCircle size={16} /> บาร์โค้ดไม่พบในระบบ {pdfInfo.miss.length} รายการ — เพิ่มด้วยการค้นหาด้านล่าง</div>
                <ul className="text-xs mt-1 list-disc ml-6">{pdfInfo.miss.map((m, i) => <li key={i}>{m.name} × {m.qty} ({m.barcode})</li>)}</ul>
              </div>
            )}
            {pdfInfo.unmatched.length > 0 && (
              <div className="rounded-xl bg-yellow/15 p-3">
                <div className="flex items-center gap-2 text-[#8a6a00] font-semibold"><AlertCircle size={16} /> บรรทัดที่อ่านไม่ออก (ไม่มีบาร์โค้ด) — เพิ่มเองด้านล่าง</div>
                <ul className="text-xs mt-1 list-disc ml-6">{pdfInfo.unmatched.map((u, i) => <li key={i}>{u}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-6 grid md:grid-cols-2 gap-4">
        <ContactPicker key={pickerKey} kind="customer" contacts={customers} label="ลูกค้า / ปลายทาง" initial={customer} />
        <div><label className="label">เลขที่เอกสาร FlowAccount (ถ้ามี)</label><input name="source_doc_no" value={docNo} onChange={(e) => setDocNo(e.target.value)} className="input font-mono" placeholder="INV2026110010" /></div>
        <div><label className="label">วันที่เบิก</label><input name="issue_date" type="date" className="input" /></div>
        <div><label className="label">เบิกไปทำอะไร *</label><input name="purpose" className="input" placeholder="เช่น ส่งห้างเซ็นทรัลเวิลด์ / ของตัวอย่างลูกค้า / ถ่ายรูป" required /></div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-display font-bold">รายการสินค้า</h2>
        <LineItemsEditor products={products} items={items} onChange={setItems} mode="issue" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={!items.length || over} className="btn-primary">บันทึกใบเบิก และตัดสต็อก</button>
        <a href="/stock/issues" className="btn-ghost">ยกเลิก</a>
        <span className="text-sm text-ink-soft ml-auto">รวม <b>{total}</b> ชิ้น{over && <span className="text-red ml-2">มีรายการเกินสต็อก</span>}</span>
      </div>
    </form>
  );
}
