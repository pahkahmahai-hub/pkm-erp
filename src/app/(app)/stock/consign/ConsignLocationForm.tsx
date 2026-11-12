"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ConsignLocation } from "@/lib/stock/consign";
import { saveConsignLocation } from "../actions";

type Cust = { id: string; name: string; code: string | null };
const COLORS = ["#452a79", "#8a5a00", "#e42213", "#06acb4", "#00856b", "#e74f99", "#0363b1", "#c2410c"];

export function ConsignLocationForm({ loc, customers }: { loc?: ConsignLocation | null; customers: Cust[] }) {
  const [picked, setPicked] = useState<string[]>(loc?.contact_ids ?? []);
  const [q, setQ] = useState("");
  const [color, setColor] = useState(loc?.color ?? COLORS[0]);
  const res = useMemo(() => { const s = q.trim().toLowerCase(); return s ? customers.filter((c) => !picked.includes(c.id) && (c.name.toLowerCase().includes(s) || (c.code ?? "").toLowerCase().includes(s))).slice(0, 10) : []; }, [q, customers, picked]);
  return (
    <form action={saveConsignLocation.bind(null, loc?.id ?? null)} className="card p-5 space-y-4">
      <h2 className="font-display font-bold">{loc ? "ตั้งค่าห้างฝากขาย" : "เพิ่มห้างฝากขาย"}</h2>
      {picked.map((id) => <input key={id} type="hidden" name="contact_ids" value={id} />)}
      <input type="hidden" name="color" value={color} />
      <div className="grid sm:grid-cols-3 gap-4">
        <div><label className="label">ชื่อห้าง</label><input name="name" defaultValue={loc?.name ?? ""} className="input" required placeholder="เช่น สารพัดไทย" /></div>
        <div><label className="label">สี</label><div className="flex gap-1.5 pt-1">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />)}</div></div>
        <div><label className="label">สถานะ</label><select name="is_active" defaultValue={loc?.is_active === false ? "off" : "on"} className="input"><option value="on">ใช้งาน</option><option value="off">ปิด (เลิกฝากขาย)</option></select></div>
      </div>
      <div>
        <label className="label">ลูกค้าในสมุดรายชื่อที่นับเป็นห้างนี้ (ทุกสาขา) — เอกสารของลูกค้าเหล่านี้จะเข้า/ออกคลังฝากขายอัตโนมัติ</label>
        <div className="flex flex-wrap gap-1.5 mb-2">{picked.map((id) => { const c = customers.find((x) => x.id === id); return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-lavender/40 px-2.5 py-1 text-xs">{c?.name ?? id.slice(0, 8)}<button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))}><X size={12} /></button></span>; })}{!picked.length && <span className="text-xs text-red">ยังไม่ได้ผูกลูกค้า — ระบบจะไม่รู้ว่าเอกสารไหนเป็นของห้างนี้</span>}</div>
        <div className="relative max-w-md"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-8" placeholder="ค้นหาลูกค้าเพื่อเพิ่ม" />
          {res.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 card p-1 max-h-60 overflow-auto">{res.map((c) => <button key={c.id} type="button" onClick={() => { setPicked((p) => [...p, c.id]); setQ(""); }} className="block w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-cream">{c.name} <span className="text-[11px] text-ink-soft">{c.code}</span></button>)}</div>}</div>
      </div>
      <div><label className="label">หมายเหตุ</label><input name="note" defaultValue={loc?.note ?? ""} className="input" placeholder="เช่น ขอรายงานคงเหลือจากคุณ… ทุกสิ้นเดือน" /></div>
      <button className="btn-primary">บันทึก</button>
    </form>
  );
}
