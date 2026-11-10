"use client";

import { useMemo, useState } from "react";
import { Search, Trash2, AlertTriangle } from "lucide-react";
import type { Company } from "@/lib/sales/types";
import type { Contact, Product } from "@/lib/stock/types";
import type { ProductionOrder, ProductionOrderItem } from "@/lib/production/types";
import { todayBkk } from "@/lib/today";

type FactoryLite = Pick<Contact, "id" | "name" | "code"> & { phone?: string | null };
type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "unit" | "stock_qty"> & { has_bom: boolean; wage: number };
interface Line { key: string; product_id: string; name: string; code: string; qty: number; wage: number; has_bom: boolean; note: string }
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MoForm({ companies, factories, products, order, items, showCost }: { companies: Company[]; factories: FactoryLite[]; products: ProductLite[]; order?: ProductionOrder | null; items?: ProductionOrderItem[]; showCost: boolean }) {
  const [today] = useState(() => todayBkk());
  const [companyId] = useState(order?.company_id ?? companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id);
  const [fac, setFac] = useState({ id: order?.factory_id ?? null as string | null, name: order?.factory_name ?? "" });
  const [fq, setFq] = useState("");
  const [pq, setPq] = useState("");
  const [lines, setLines] = useState<Line[]>((items ?? []).map((i) => ({ key: i.id, product_id: i.product_id, name: i.products?.name ?? "", code: i.products?.code ?? "", qty: i.qty_ordered, wage: Number(i.wage_per_piece), has_bom: !!i.bom_id, note: i.note ?? "" })));
  const facResults = useMemo(() => { const s = fq.trim().toLowerCase(); return s ? factories.filter((f) => f.name.toLowerCase().includes(s) || (f.code ?? "").toLowerCase().includes(s)).slice(0, 8) : []; }, [fq, factories]);
  const prodResults = useMemo(() => { const s = pq.trim().toLowerCase(); return s ? products.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || (p.barcode ?? "").includes(s)).slice(0, 8) : []; }, [pq, products]);
  const add = (p: ProductLite) => { if (!lines.some((l) => l.product_id === p.id)) setLines((x) => [...x, { key: crypto.randomUUID(), product_id: p.id, name: p.name, code: p.code, qty: 10, wage: p.wage, has_bom: p.has_bom, note: "" }]); setPq(""); };
  const upd = (key: string, patch: Partial<Line>) => setLines((x) => x.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const totalQty = lines.reduce((a, l) => a + l.qty, 0); const totalWage = lines.reduce((a, l) => a + l.qty * l.wage, 0);
  return (
    <div className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} /><input type="hidden" name="factory_id" value={fac.id ?? ""} />
      <input type="hidden" name="items" value={JSON.stringify(lines.filter((l) => l.qty > 0).map(({ product_id, qty, wage, note }) => ({ product_id, qty, wage_per_piece: wage, note: note || null })))} />
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="relative"><label className="label">โรงงาน / ชุมชนผู้ผลิต</label>
            <div className="flex gap-2"><input name="factory_name" value={fac.name} onChange={(e) => setFac({ id: null, name: e.target.value })} className="input" placeholder="ชื่อโรงงาน" required />
              <div className="relative w-40 shrink-0"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={fq} onChange={(e) => setFq(e.target.value)} className="input pl-8" placeholder="ค้นหา" />
                {facResults.length > 0 && <div className="absolute z-10 right-0 mt-1 w-72 card p-1 max-h-60 overflow-auto">{facResults.map((f) => <button key={f.id} type="button" onClick={() => { setFac({ id: f.id, name: f.name }); setFq(""); }} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{f.name}<div className="text-[11px] text-ink-soft">{f.code ?? ""} {f.phone ?? ""}</div></button>)}</div>}</div></div>
            {fac.id && <p className="text-[11px] text-green mt-1">✓ ผูกกับสมุดรายชื่อ (ซัพพลายเออร์) — ใช้ออกบิลค่าจ้างและ 50 ทวิ</p>}</div>
          <div><label className="label">วันที่สั่ง</label><input type="date" name="doc_date" defaultValue={order?.doc_date ?? today} className="input" required /></div>
          <div><label className="label">กำหนดส่งงาน</label><input type="date" name="due_date" defaultValue={order?.due_date ?? ""} className="input" /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">หมายเหตุถึงโรงงาน (พิมพ์บนใบสั่งผลิต)</label><input name="notes" defaultValue={order?.notes ?? ""} className="input" placeholder="เช่น เย็บตามแพทเทิร์นเดิม ติดป้ายแบรนด์ทุกชิ้น" /></div>
          <div><label className="label">หมายเหตุภายใน</label><input name="internal_note" defaultValue={order?.internal_note ?? ""} className="input" /></div>
        </div>
      </div>
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold">สินค้าที่สั่งผลิต</h2>
          <div className="relative w-96"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={pq} onChange={(e) => setPq(e.target.value)} className="input pl-8" placeholder="ค้นหาสินค้า — ชื่อ / รหัส / บาร์โค้ด" />
            {prodResults.length > 0 && <div className="absolute z-10 right-0 mt-1 w-full card p-1 max-h-64 overflow-auto">{prodResults.map((p) => <button key={p.id} type="button" onClick={() => add(p)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{p.name}<div className="text-[11px] text-ink-soft">{p.code} · คงเหลือ {p.stock_qty} {p.unit} · {p.has_bom ? "มี BOM" : "⚠ ยังไม่มี BOM"}</div></button>)}</div>}</div>
        </div>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>สินค้า</th><th className="w-28 text-right">จำนวน (ชิ้น)</th>{showCost && <><th className="w-32 text-right">ค่าจ้าง/ชิ้น</th><th className="w-32 text-right">ค่าจ้างรวม</th></>}<th className="w-48">หมายเหตุ</th><th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.key}><td><div className="font-medium">{l.name}</div><div className="text-[11px] text-ink-soft">{l.code}</div>{!l.has_bom && <div className="text-[11px] text-[#8a6a00] flex items-center gap-1"><AlertTriangle size={11} /> ยังไม่มี BOM — ระบบจะไม่คำนวณวัสดุให้ (เบิกเองได้)</div>}</td>
              <td><input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) })} className="input text-right" /></td>
              {showCost && <><td><input type="number" step="0.01" min={0} value={l.wage} onChange={(e) => upd(l.key, { wage: Number(e.target.value) })} className="input text-right" /></td><td className="text-right font-semibold">{fmt(l.qty * l.wage)}</td></>}
              <td><input value={l.note} onChange={(e) => upd(l.key, { note: e.target.value })} className="input text-xs" placeholder="สี / ไซซ์ / ลาย" /></td>
              <td><button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} className="text-ink-soft hover:text-red"><Trash2 size={14} /></button></td></tr>))}
            {!lines.length && <tr><td colSpan={showCost ? 6 : 4} className="text-center text-ink-soft py-6">ค้นหาสินค้าด้านบนเพื่อเพิ่ม</td></tr>}</tbody>
          {lines.length > 0 && <tfoot><tr className="font-bold"><td>รวม</td><td className="text-right">{totalQty.toLocaleString()} ชิ้น</td>{showCost && <><td /><td className="text-right">{fmt(totalWage)}</td></>}<td colSpan={2} /></tr></tfoot>}
        </table></div>
        {!showCost && <p className="text-[11px] text-ink-soft">ค่าจ้าง/ชิ้นใช้ค่ามาตรฐานจาก BOM (ผู้บริหารแก้ไขได้)</p>}
      </div>
    </div>
  );
}
