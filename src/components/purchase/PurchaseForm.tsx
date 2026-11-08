"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import type { Company, VatMode } from "@/lib/sales/types";
import type { Contact, Product, Material } from "@/lib/stock/types";
import type { PurchaseDoc, PurchaseItem } from "@/lib/purchase/types";
import { todayBkk } from "@/lib/today";

type SupplierLite = Pick<Contact, "id" | "name" | "code" | "tax_id" | "address" | "address2" | "address3" | "postcode" | "branch_code"> & { default_vat_mode_purchase?: VatMode | null };
type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "unit">;
type MaterialLite = Pick<Material, "id" | "code" | "name" | "unit" | "kind">;
interface Line { key: string; product_id: string | null; material_id: string | null; description: string; detail: string; qty: number; unit: string; unit_price: number; discount_pct: number; received_qty: number }
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;

export function PurchaseForm({ type, companies, suppliers, products, materials, doc, items, showPrices = true, buyerDefault }: {
  type: "pr" | "po"; companies: Company[]; suppliers: SupplierLite[]; products: ProductLite[]; materials: MaterialLite[]; doc?: PurchaseDoc | null; items?: PurchaseItem[]; showPrices?: boolean; buyerDefault?: string;
}) {
  const [today] = useState(() => todayBkk());
  const [companyId, setCompanyId] = useState(doc?.company_id ?? companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id);
  const [sup, setSup] = useState({ id: doc?.supplier_id ?? null as string | null, name: doc?.supplier_name ?? "", tax_id: doc?.supplier_tax_id ?? "", address: doc?.supplier_address ?? "", branch: doc?.supplier_branch ?? "" });
  const [sq, setSq] = useState("");
  const [vatMode, setVatMode] = useState<VatMode>(doc?.vat_mode ?? "exclusive");
  const [discPct, setDiscPct] = useState(Number(doc?.discount_pct ?? 0));
  const [discAmt, setDiscAmt] = useState(Number(doc?.discount_amount ?? 0));
  const [lines, setLines] = useState<Line[]>((items ?? []).map((i) => ({ key: i.id, product_id: i.product_id, material_id: i.material_id, description: i.description, detail: i.detail ?? "", qty: Number(i.qty), unit: i.unit, unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct), received_qty: Number(i.received_qty) })));
  const [pq, setPq] = useState("");

  const supResults = useMemo(() => { const s = sq.trim().toLowerCase(); return s ? suppliers.filter((c) => c.name.toLowerCase().includes(s) || (c.code ?? "").toLowerCase().includes(s) || (c.tax_id ?? "").includes(s)).slice(0, 8) : []; }, [sq, suppliers]);
  const catResults = useMemo(() => {
    const q = pq.trim().toLowerCase(); if (!q) return [] as { kind: "product" | "material"; id: string; label: string; sub: string; unit: string }[];
    const a = products.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q)).slice(0, 6).map((p) => ({ kind: "product" as const, id: p.id, label: p.name, sub: `สินค้า · ${p.code}`, unit: p.unit }));
    const b = materials.filter((m) => (m.code ?? "").toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 6).map((m) => ({ kind: "material" as const, id: m.id, label: m.name, sub: `${m.kind === "fabric" ? "ลายผ้า" : "แพคเกจจิ้ง"}${m.code ? ` · ${m.code}` : ""}`, unit: m.unit }));
    return [...a, ...b];
  }, [pq, products, materials]);

  function pickSupplier(c: SupplierLite) {
    setSup({ id: c.id, name: c.name, tax_id: c.tax_id ?? "", address: [c.address, c.address2, c.address3, c.postcode].filter(Boolean).join(" "), branch: c.branch_code ?? "" });
    if (c.default_vat_mode_purchase) setVatMode(c.default_vat_mode_purchase);
    setSq("");
  }
  const addLine = (l?: Partial<Line>) => setLines((x) => [...x, { key: crypto.randomUUID(), product_id: null, material_id: null, description: "", detail: "", qty: 1, unit: "ชิ้น", unit_price: 0, discount_pct: 0, received_qty: 0, ...l }]);
  const upd = (key: string, patch: Partial<Line>) => setLines((x) => x.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const sub = lines.reduce((a, l) => a + r2(l.qty * l.unit_price * (1 - l.discount_pct / 100)), 0);
  const after = sub - discAmt - r2(sub * discPct / 100);
  const net = vatMode === "inclusive" ? r2(after * 100 / 107) : after;
  const vat = vatMode === "inclusive" ? r2(after - net) : vatMode === "exclusive" ? r2(after * 0.07) : 0;
  const grand = vatMode === "exclusive" ? r2(net + vat) : after;

  return (
    <div className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} /><input type="hidden" name="supplier_id" value={sup.id ?? ""} />
      <input type="hidden" name="items" value={JSON.stringify(lines.filter((l) => l.description.trim()).map(({ product_id, material_id, description, detail, qty, unit, unit_price, discount_pct, received_qty }) => ({ product_id, material_id, description, detail: detail || null, qty, unit, unit_price, discount_pct, received_qty })))} />

      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className="label">บริษัทผู้ซื้อ</label><select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}</select></div>
          <div><label className="label">วันที่เอกสาร</label><input type="date" name="doc_date" defaultValue={doc?.doc_date ?? today} className="input" required /></div>
          <div><label className="label">{type === "pr" ? "ต้องการของภายใน" : "กำหนดส่งของ"}</label><input type="date" name="need_by" defaultValue={doc?.need_by ?? ""} className="input" /></div>
        </div>
        <div className="relative">
          <label className="label">ซัพพลายเออร์ / ผู้จำหน่าย {type === "pr" && <span className="text-ink-soft font-normal">(ถ้ารู้)</span>}</label>
          <div className="flex gap-2">
            <input name="supplier_name" value={sup.name} onChange={(e) => setSup({ ...sup, name: e.target.value, id: null })} className="input" placeholder="ชื่อร้าน / บริษัท" required={type === "po"} />
            <div className="relative w-56 shrink-0"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={sq} onChange={(e) => setSq(e.target.value)} className="input pl-8" placeholder="ค้นสมุดรายชื่อ" />
              {supResults.length > 0 && <div className="absolute z-10 right-0 mt-1 w-80 card p-1 max-h-60 overflow-auto">{supResults.map((c) => <button key={c.id} type="button" onClick={() => pickSupplier(c)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{c.name}<div className="text-[11px] text-ink-soft">{c.code} {c.tax_id}</div></button>)}</div>}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-[1fr_110px_1fr] gap-4">
          <div><label className="label">เลขผู้เสียภาษี</label><input name="supplier_tax_id" value={sup.tax_id} onChange={(e) => setSup({ ...sup, tax_id: e.target.value })} className="input" /></div>
          <div><label className="label">สาขา</label><input name="supplier_branch" value={sup.branch} onChange={(e) => setSup({ ...sup, branch: e.target.value })} className="input" placeholder="สำนักงานใหญ่" /></div>
          <div><label className="label">ผู้สั่งซื้อ (พิมพ์บนเอกสาร)</label><input name="buyer_name" defaultValue={doc?.buyer_name ?? buyerDefault ?? ""} className="input" /></div>
        </div>
        <div><label className="label">ที่อยู่ผู้จำหน่าย</label><input name="supplier_address" value={sup.address} onChange={(e) => setSup({ ...sup, address: e.target.value })} className="input" /></div>
        <div><label className="label">{type === "pr" ? "ขอซื้อเพื่อ / เหตุผล" : "วัตถุประสงค์ (อ้างอิงภายใน)"}</label><input name="purpose" defaultValue={doc?.purpose ?? ""} className="input" placeholder="เช่น ผ้าสำหรับผลิตล็อตธันวาคม, แพคเกจจิ้งออเดอร์ Central" required={type === "pr"} /></div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold">รายการ</h2>
          <div className="flex items-center gap-2">
            <div className="relative w-80"><Search size={14} className="absolute left-3 top-3 text-ink-soft" />
              <input value={pq} onChange={(e) => setPq(e.target.value)} className="input pl-8" placeholder="ค้นหาสินค้า / ลายผ้า / แพคเกจจิ้ง…" />
              {catResults.length > 0 && <div className="absolute z-10 right-0 mt-1 w-96 card p-1 max-h-64 overflow-auto">{catResults.map((r) => <button key={r.kind + r.id} type="button" onClick={() => { addLine({ product_id: r.kind === "product" ? r.id : null, material_id: r.kind === "material" ? r.id : null, description: r.label, unit: r.unit }); setPq(""); }} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{r.label}<div className="text-[11px] text-ink-soft">{r.sub} · หน่วย {r.unit}</div></button>)}</div>}</div>
            <button type="button" onClick={() => addLine()} className="btn-ghost text-xs"><Plus size={14} /> พิมพ์เอง</button>
          </div>
        </div>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th className="w-[40%]">รายละเอียด</th><th className="w-24 text-right">จำนวน</th><th className="w-20">หน่วย</th>{showPrices && <><th className="w-28 text-right">ราคา/หน่วย</th><th className="w-20 text-right">ลด %</th><th className="w-28 text-right">รวม</th></>}<th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.key}>
              <td>
                <input value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} className="input" placeholder="ชื่อรายการ" />
                <textarea value={l.detail} onChange={(e) => upd(l.key, { detail: e.target.value })} className="input mt-1 text-xs" rows={l.detail ? Math.min(6, l.detail.split("\n").length + 1) : 1} placeholder="บรรทัดย่อย เช่น - เขียวแดง : 40 (ขึ้นบรรทัดใหม่ได้)" />
                {(l.product_id || l.material_id) && <div className="text-[10px] text-green mt-0.5">✓ ผูกกับ{l.product_id ? "สินค้า" : "วัสดุ"}ในคลัง — รับของแล้วเข้าคลังอัตโนมัติ</div>}
              </td>
              <td><input type="number" step="0.01" min={0} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) })} className="input text-right" /></td>
              <td><input value={l.unit} onChange={(e) => upd(l.key, { unit: e.target.value })} className="input" /></td>
              {showPrices && <>
                <td><input type="number" step="0.01" min={0} value={l.unit_price} onChange={(e) => upd(l.key, { unit_price: Number(e.target.value) })} className="input text-right" /></td>
                <td><input type="number" step="0.01" min={0} max={100} value={l.discount_pct} onChange={(e) => upd(l.key, { discount_pct: Number(e.target.value) })} className="input text-right" /></td>
                <td className="text-right font-semibold whitespace-nowrap">{fmt(r2(l.qty * l.unit_price * (1 - l.discount_pct / 100)))}</td>
              </>}
              <td><button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} className="text-ink-soft hover:text-red"><Trash2 size={14} /></button></td>
            </tr>))}
            {!lines.length && <tr><td colSpan={showPrices ? 7 : 4} className="text-center text-ink-soft py-6">ค้นหาสินค้า/วัสดุด้านบน หรือกด “พิมพ์เอง”</td></tr>}
          </tbody></table></div>
      </div>

      <div className="grid md:grid-cols-[1fr_300px] gap-5">
        <div className="card p-5 space-y-4">
          {showPrices && <div className="grid sm:grid-cols-3 gap-4">
            <div><label className="label">VAT</label><select name="vat_mode" value={vatMode} onChange={(e) => setVatMode(e.target.value as VatMode)} className="input"><option value="exclusive">ราคาก่อน VAT (+7%)</option><option value="inclusive">ราคารวม VAT</option><option value="none">ไม่มี VAT</option></select></div>
            <div><label className="label">ส่วนลดท้ายบิล %</label><input type="number" step="0.01" name="discount_pct" value={discPct} onChange={(e) => setDiscPct(Number(e.target.value))} className="input" /></div>
            <div><label className="label">ส่วนลดท้ายบิล (บาท)</label><input type="number" step="0.01" name="discount_amount" value={discAmt} onChange={(e) => setDiscAmt(Number(e.target.value))} className="input" /></div>
          </div>}
          {!showPrices && <><input type="hidden" name="vat_mode" value={vatMode} /><input type="hidden" name="discount_pct" value={discPct} /><input type="hidden" name="discount_amount" value={discAmt} /></>}
          <div><label className="label">หมายเหตุบนเอกสาร</label><textarea name="notes" defaultValue={doc?.notes ?? ""} className="input" rows={2} placeholder="เงื่อนไขการส่ง / การชำระเงิน" /></div>
          <div><label className="label">หมายเหตุภายใน</label><input name="internal_note" defaultValue={doc?.internal_note ?? ""} className="input" /></div>
        </div>
        {showPrices && <div className="card p-5 text-sm space-y-1.5 h-fit">
          <Row l="รวมรายการ" v={sub} />{(discPct > 0 || discAmt > 0) && <Row l="ส่วนลดท้ายบิล" v={-(discAmt + r2(sub * discPct / 100))} />}
          {vatMode !== "none" && <><Row l="มูลค่าก่อน VAT" v={net} /><Row l="VAT 7%" v={vat} /></>}
          <div className="border-t border-line pt-2 mt-2 flex justify-between items-baseline"><span className="font-semibold">รวมทั้งสิ้น</span><span className="font-display text-xl font-bold text-purple">{fmt(grand)}</span></div>
        </div>}
      </div>
    </div>
  );
}
function Row({ l, v }: { l: string; v: number }) { return <div className="flex justify-between"><span className="text-ink-soft">{l}</span><span>{v < 0 ? `−${fmt(-v)}` : fmt(v)}</span></div>; }
