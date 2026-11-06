"use client";

import { useMemo, useState } from "react";
import { ContactPicker } from "@/components/stock/ContactPicker";
import { createDefect } from "../actions";
import type { Product, Contact } from "@/lib/stock/types";

type P = Pick<Product, "id" | "code" | "name" | "barcode" | "stock_qty">;

export function DefectForm({ products, suppliers }: { products: P[]; suppliers: Pick<Contact, "id" | "name" | "code" | "tax_id">[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<P | null>(null);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter((p) => p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s)).slice(0, 8) : [];
  }, [q, products]);

  return (
    <form action={createDefect} className="card p-5 grid md:grid-cols-4 gap-3">
      <div className="md:col-span-4 font-display font-bold">บันทึกของเสีย (พบภายหลัง)</div>
      <input type="hidden" name="product_id" value={sel?.id ?? ""} />
      <div className="md:col-span-2">
        <label className="label">สินค้า *</label>
        {sel ? (
          <div className="flex items-center justify-between rounded-xl border border-purple bg-lavender/20 px-3 py-2.5 text-sm">
            <span><span className="font-mono text-xs text-ink-soft mr-2">{sel.code}</span>{sel.name} <span className="text-xs text-ink-soft">(คงเหลือ {sel.stock_qty})</span></span>
            <button type="button" onClick={() => setSel(null)} className="text-xs text-purple">เปลี่ยน</button>
          </div>
        ) : (
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="ค้นหาชื่อ / รหัส / บาร์โค้ด" />
            {results.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full card divide-y divide-line max-h-64 overflow-auto">
                {results.map((p) => <li key={p.id}><button type="button" onClick={() => { setSel(p); setQ(""); }} className="w-full text-left px-3 py-2 hover:bg-cream text-sm"><span className="font-mono text-xs text-ink-soft mr-2">{p.code}</span>{p.name}</button></li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <div><label className="label">จำนวน *</label><input name="qty" type="number" min={1} defaultValue={1} className="input" required /></div>
      <div><label className="label">สถานะ</label><select name="status" className="input"><option value="review">รอพิจารณา</option><option value="return_pending">รอส่งคืน</option></select></div>
      <div className="md:col-span-2"><ContactPicker kind="supplier" contacts={suppliers} label="ซัพพลายเออร์ (ถ้ารู้)" /></div>
      <div className="md:col-span-2"><label className="label">สาเหตุ / หมายเหตุ</label><input name="note" className="input" placeholder="เช่น ตะเข็บหลุด, สีเพี้ยน" /></div>
      <div className="md:col-span-3 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name="from_stock" value="yes" defaultChecked className="accent-purple" /> หักออกจากสต็อกดี (ของชิ้นนี้นับอยู่ในสต็อกตอนนี้)</label>
        <label className="flex items-center gap-2 mt-1"><input type="radio" name="from_stock" value="no" className="accent-purple" /> ไม่หักสต็อก (ของเสียที่ไม่เคยนับอยู่ในสต็อก)</label>
      </div>
      <div className="flex items-end"><button disabled={!sel} className="btn-primary w-full">บันทึกของเสีย</button></div>
    </form>
  );
}
