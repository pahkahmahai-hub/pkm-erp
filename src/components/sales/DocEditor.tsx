"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import type { Company, SalesDoc, SalesDocItem, SalesDocType, VatMode, SalesChannel } from "@/lib/sales/types";
import { DOC_META, VAT_TH, CHANNEL_TH } from "@/lib/sales/types";
import type { Contact, Product } from "@/lib/stock/types";

type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "price" | "unit" | "stock_qty">;
type ContactLite = Pick<Contact, "id" | "name" | "code" | "tax_id" | "address" | "address2" | "address3" | "postcode" | "branch_code" | "credit_days">;
interface Line { key: string; product_id: string | null; description: string; barcode: string; qty: number; unit: string; unit_price: number; discount_pct: number; note: string }

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DocEditor({ docType, companies, products, customers, doc, items, prefill }: {
  docType: SalesDocType; companies: Company[]; products: ProductLite[]; customers: ContactLite[];
  doc?: SalesDoc | null; items?: SalesDocItem[]; prefill?: { ref_doc_id?: string; ref_doc_no?: string };
}) {
  const meta = DOC_META[docType];
  const [companyId, setCompanyId] = useState(doc?.company_id ?? companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id);
  const company = companies.find((c) => c.id === companyId);
  const [vatMode, setVatMode] = useState<VatMode>(doc?.vat_mode ?? (company?.vat_registered ? "inclusive" : "none"));
  const [discPct, setDiscPct] = useState(Number(doc?.discount_pct ?? 0));
  const [discAmt, setDiscAmt] = useState(Number(doc?.discount_amount ?? 0));
  const [deposit, setDeposit] = useState(Number(doc?.deposit_amount ?? 0));
  const [wht, setWht] = useState(Number(doc?.wht_pct ?? 0));
  const [lines, setLines] = useState<Line[]>(
    (items ?? []).map((i) => ({ key: i.id, product_id: i.product_id, description: i.description, barcode: i.barcode ?? "", qty: Number(i.qty), unit: i.unit ?? "ชิ้น", unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct), note: i.note ?? "" })),
  );
  const [cust, setCust] = useState<{ id: string | null; name: string; address: string; tax_id: string; branch: string }>({
    id: doc?.customer_id ?? null, name: doc?.customer_name ?? "", address: doc?.customer_address ?? "", tax_id: doc?.customer_tax_id ?? "", branch: doc?.customer_branch ?? "",
  });
  const [cq, setCq] = useState("");
  const [pq, setPq] = useState("");

  const custResults = useMemo(() => { const s = cq.trim().toLowerCase(); return s ? customers.filter((c) => c.name.toLowerCase().includes(s) || (c.code ?? "").toLowerCase().includes(s) || (c.tax_id ?? "").includes(s)).slice(0, 8) : []; }, [cq, customers]);
  const prodResults = useMemo(() => { const s = pq.trim().toLowerCase(); return s ? products.filter((p) => p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s)).slice(0, 8) : []; }, [pq, products]);

  function pickCustomer(c: ContactLite) {
    setCust({ id: c.id, name: c.name, address: [c.address, c.address2, c.address3, c.postcode].filter(Boolean).join(" "), tax_id: c.tax_id ?? "", branch: c.branch_code ?? "" });
    setCq("");
  }
  function addProduct(p: ProductLite) {
    setLines((l) => [...l, { key: crypto.randomUUID(), product_id: p.id, description: `${p.name} ${p.barcode ?? ""}`.trim(), barcode: p.barcode ?? "", qty: 1, unit: p.unit, unit_price: Number(p.price), discount_pct: 0, note: "" }]);
    setPq("");
  }
  function addFree() { setLines((l) => [...l, { key: crypto.randomUUID(), product_id: null, description: "", barcode: "", qty: 1, unit: "ชิ้น", unit_price: 0, discount_pct: 0, note: "" }]); }
  function upd(key: string, patch: Partial<Line>) { setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x))); }

  // totals preview (same math as DB)
  const sub = lines.reduce((a, l) => a + Math.round(l.qty * l.unit_price * (1 - l.discount_pct / 100) * 100) / 100, 0);
  const disc = discPct > 0 ? Math.round(sub * discPct) / 100 : discAmt;
  const after = sub - disc - deposit;
  const net = vatMode === "inclusive" ? Math.round((after * 100) / 107 * 100) / 100 : after;
  const vat = vatMode === "inclusive" ? after - net : vatMode === "exclusive" ? Math.round(after * 7) / 100 : 0;
  const grand = vatMode === "exclusive" ? net + vat : after;
  const whtAmt = Math.round(net * wht) / 100;

  const payload = lines.map((l) => ({ product_id: l.product_id, description: l.description, barcode: l.barcode, qty: l.qty, unit: l.unit, unit_price: l.unit_price, discount_pct: l.discount_pct, note: l.note }));
  const isDeliveryType = docType === "invoice" || docType === "temp_delivery";

  return (
    <div className="space-y-6">
      <input type="hidden" name="doc_type" value={docType} />
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <input type="hidden" name="contact_id" value={cust.id ?? ""} />
      {prefill?.ref_doc_id && <input type="hidden" name="ref_doc_id" value={prefill.ref_doc_id} />}

      <div className="card p-6 grid md:grid-cols-3 gap-4">
        <div>
          <label className="label">ออกในนามบริษัท</label>
          <select name="company_id" value={companyId} onChange={(e) => { setCompanyId(e.target.value); const c = companies.find((x) => x.id === e.target.value); if (c && !c.vat_registered) setVatMode("none"); else if (vatMode === "none") setVatMode("inclusive"); }} className="input" disabled={!!doc}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name_th}{!c.vat_registered && " (ไม่จด VAT)"}</option>)}
          </select>
          {doc && <input type="hidden" name="company_id" value={companyId} />}
        </div>
        <div><label className="label">วันที่เอกสาร</label><input name="doc_date" type="date" defaultValue={doc?.doc_date ?? new Date().toISOString().slice(0, 10)} className="input" required /></div>
        {docType === "quotation" ? <div><label className="label">ยืนราคาถึง</label><input name="valid_until" type="date" defaultValue={doc?.valid_until ?? ""} className="input" /></div>
          : <div><label className="label">ครบกำหนด</label><input name="due_date" type="date" defaultValue={doc?.due_date ?? ""} className="input" /></div>}
        <div><label className="label">ช่องทาง</label>
          <select name="channel" defaultValue={doc?.channel ?? "corporate"} className="input">{(Object.keys(CHANNEL_TH) as SalesChannel[]).map((k) => <option key={k} value={k}>{CHANNEL_TH[k]}</option>)}</select></div>
        <div><label className="label">PO ลูกค้า / ห้าง</label><input name="po_no" defaultValue={doc?.po_no ?? ""} className="input" /></div>
        <div><label className="label">เอกสารอ้างอิง</label><input name="ref_doc_no" defaultValue={doc?.ref_doc_no ?? prefill?.ref_doc_no ?? ""} className="input font-mono" placeholder="QT2026110009" /></div>
        <div><label className="label">ผู้ขาย</label><input name="seller_name" defaultValue={doc?.seller_name ?? ""} className="input" /></div>
        {!doc && <div><label className="label">เลขที่เอกสาร (เว้นว่าง = ออกอัตโนมัติ)</label><input name="doc_no" className="input font-mono" placeholder={`${meta.prefix}YYYYMM0001`} /></div>}
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-display font-bold">ลูกค้า</h2>
        {!cust.id && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
            <input value={cq} onChange={(e) => setCq(e.target.value)} className="input pl-9" placeholder="ค้นหาจากสมุดรายชื่อ (ชื่อ / รหัส / เลขภาษี) หรือพิมพ์ด้านล่างเอง" />
            {custResults.length > 0 && <ul className="absolute z-20 mt-1 w-full card divide-y divide-line max-h-64 overflow-auto">{custResults.map((c) => <li key={c.id}><button type="button" onClick={() => pickCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-cream text-sm">{c.name}<span className="text-xs text-ink-soft ml-2">{c.tax_id}</span></button></li>)}</ul>}
          </div>
        )}
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2"><label className="label">ชื่อลูกค้า *</label><input name="customer_name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} className="input" required /></div>
          <div><label className="label">เลขผู้เสียภาษี</label><input name="customer_tax_id" value={cust.tax_id} onChange={(e) => setCust({ ...cust, tax_id: e.target.value })} className="input font-mono" /></div>
          <div><label className="label">สาขา</label><input name="customer_branch" value={cust.branch} onChange={(e) => setCust({ ...cust, branch: e.target.value })} className="input" placeholder="สำนักงานใหญ่ / 00002" /></div>
          <div className="md:col-span-4"><label className="label">ที่อยู่</label><input name="customer_address" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} className="input" /></div>
        </div>
        {cust.id && <button type="button" onClick={() => setCust({ id: null, name: "", address: "", tax_id: "", branch: "" })} className="text-xs text-purple">เปลี่ยนลูกค้า</button>}
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-display font-bold">รายการ</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
            <input value={pq} onChange={(e) => setPq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const ex = products.find((p) => p.barcode === pq.trim() || p.code.toLowerCase() === pq.trim().toLowerCase()) ?? prodResults[0]; if (ex) addProduct(ex); } }} className="input pl-9" placeholder="เพิ่มสินค้าจากคลัง: ชื่อ / รหัส / ยิงบาร์โค้ด" />
            {prodResults.length > 0 && <ul className="absolute z-20 mt-1 w-full card divide-y divide-line max-h-64 overflow-auto">{prodResults.map((p) => <li key={p.id}><button type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 hover:bg-cream text-sm flex justify-between"><span><span className="font-mono text-xs text-ink-soft mr-2">{p.code}</span>{p.name}</span><span className="text-xs text-ink-soft">฿{Number(p.price).toLocaleString()} · คงเหลือ {p.stock_qty}</span></button></li>)}</ul>}
          </div>
          <button type="button" onClick={addFree} className="btn-outline whitespace-nowrap"><Plus size={16} /> รายการอิสระ</button>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[860px]">
            <thead><tr><th className="w-8">#</th><th>รายละเอียด</th><th className="w-24">จำนวน</th><th className="w-20">หน่วย</th><th className="w-32">ราคา/หน่วย</th><th className="w-20">ส่วนลด%</th><th className="w-32 text-right">ยอดรวม</th><th className="w-8"></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key}>
                  <td className="text-ink-soft">{i + 1}</td>
                  <td><textarea value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} className="input" rows={1} />{l.product_id && <div className="text-[10px] text-ink-soft mt-0.5">สินค้าในคลัง · บาร์โค้ด {l.barcode}</div>}</td>
                  <td><input type="number" step="0.01" value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) })} className="input" /></td>
                  <td><input value={l.unit} onChange={(e) => upd(l.key, { unit: e.target.value })} className="input" /></td>
                  <td><input type="number" step="0.01" value={l.unit_price} onChange={(e) => upd(l.key, { unit_price: Number(e.target.value) })} className="input text-right" /></td>
                  <td><input type="number" step="0.01" value={l.discount_pct} onChange={(e) => upd(l.key, { discount_pct: Number(e.target.value) })} className="input text-right" /></td>
                  <td className="text-right font-semibold">{fmt(Math.round(l.qty * l.unit_price * (1 - l.discount_pct / 100) * 100) / 100)}</td>
                  <td><button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} className="text-red"><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={8} className="text-center text-ink-soft py-6">ยังไม่มีรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-3">
          <h2 className="font-display font-bold">เงื่อนไข</h2>
          <div><label className="label">ภาษีมูลค่าเพิ่ม</label>
            <select name="vat_mode" value={vatMode} onChange={(e) => setVatMode(e.target.value as VatMode)} className="input" disabled={company ? !company.vat_registered : false}>{(Object.keys(VAT_TH) as VatMode[]).map((k) => <option key={k} value={k}>{VAT_TH[k]}</option>)}</select>
            {company && !company.vat_registered && <input type="hidden" name="vat_mode" value="none" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">ส่วนลดท้ายบิล %</label><input name="discount_pct" type="number" step="0.01" value={discPct} onChange={(e) => setDiscPct(Number(e.target.value))} className="input" /></div>
            <div><label className="label">หรือ ส่วนลด (บาท)</label><input name="discount_amount" type="number" step="0.01" value={discAmt} onChange={(e) => setDiscAmt(Number(e.target.value))} className="input" disabled={discPct > 0} /></div>
            {(docType === "billing" || docType === "invoice") && <>
              <div><label className="label">หักเงินมัดจำ (บาท)</label><input name="deposit_amount" type="number" step="0.01" value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} className="input" /></div>
              <div><label className="label">อ้างอิงมัดจำ</label><input name="deposit_ref" defaultValue={doc?.deposit_ref ?? ""} className="input" placeholder="INV2026080072" /></div>
            </>}
            {docType === "receipt" && <div><label className="label">หัก ณ ที่จ่าย %</label><input name="wht_pct" type="number" step="0.5" value={wht} onChange={(e) => setWht(Number(e.target.value))} className="input" /></div>}
          </div>
          {isDeliveryType && <label className="flex items-center gap-2 text-sm pt-1"><input type="checkbox" name="deduct_stock" defaultChecked={doc?.deduct_stock ?? true} className="accent-purple" /> ตัดสต็อกคลังใหญ่เมื่อออกเอกสาร (เฉพาะรายการที่เป็นสินค้าในคลัง)</label>}
          <div><label className="label">หมายเหตุบนเอกสาร</label><textarea name="notes" defaultValue={doc?.notes ?? ""} className="input" rows={2} placeholder="เงื่อนไขชำระเงิน / ข้อความถึงลูกค้า" /></div>
          <div><label className="label">บันทึกภายใน (ไม่แสดงบนเอกสาร)</label><input name="internal_note" defaultValue={doc?.internal_note ?? ""} className="input" /></div>
        </div>
        <div className="card p-6 text-sm space-y-1.5 h-fit" style={{ borderTopColor: meta.color, borderTopWidth: 4 }}>
          <h2 className="font-display font-bold mb-2">{meta.th}</h2>
          <Row l="รวมเป็นเงิน" v={sub} />
          {disc > 0 && <Row l={`ส่วนลด${discPct > 0 ? ` ${discPct}%` : ""}`} v={-disc} />}
          {deposit > 0 && <Row l="หักเงินมัดจำ" v={-deposit} />}
          {vatMode === "inclusive" && <><Row l="ราคาไม่รวมภาษีมูลค่าเพิ่ม" v={net} /><Row l="ภาษีมูลค่าเพิ่ม 7%" v={vat} /></>}
          {vatMode === "exclusive" && <><Row l="จำนวนเงินหลังหักส่วนลด" v={after} /><Row l="ภาษีมูลค่าเพิ่ม 7%" v={vat} /></>}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-line"><span>จำนวนเงินรวมทั้งสิ้น</span><span>฿{fmt(grand)}</span></div>
          {wht > 0 && <><Row l={`หัก ณ ที่จ่าย ${wht}%`} v={-whtAmt} /><div className="flex justify-between font-semibold"><span>ยอดรับสุทธิ</span><span>฿{fmt(grand - whtAmt)}</span></div></>}
        </div>
      </div>
    </div>
  );
}

function Row({ l, v }: { l: string; v: number }) {
  return <div className="flex justify-between"><span className="text-ink-soft">{l}</span><span>{fmt(v)}</span></div>;
}
