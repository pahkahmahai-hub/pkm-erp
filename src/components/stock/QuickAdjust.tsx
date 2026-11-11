"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Check, X } from "lucide-react";
import { quickAdjustStock } from "@/app/(app)/stock/actions";

/** Inline stock adjuster for the product list: − / number / + → บันทึก (asks a reason, logs an adjust movement). */
export function QuickAdjust({ productId, qty, low }: { productId: string; qty: number; low: boolean }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(qty);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(qty);

  if (!open) {
    return (
      <button type="button" onClick={() => { setVal(current); setOpen(true); }} title="ปรับยอด" className={`group inline-flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-lavender/40 font-semibold ${current === 0 ? "text-red" : low ? "text-[#8a6a00]" : ""}`}>
        {current}{low && <span className="badge-late ml-1">ต่ำ</span>}<span className="text-[10px] text-ink-soft opacity-0 group-hover:opacity-100">แก้</span>
      </button>
    );
  }
  const diff = val - current;
  const save = () => {
    setErr(null);
    start(async () => {
      const r = await quickAdjustStock(productId, val, reason || `ปรับยอดจากหน้าสินค้า (${diff > 0 ? "+" : ""}${diff})`);
      if (r?.error) { setErr(r.error); return; }
      setCurrent(val); setOpen(false); setReason("");
    });
  };
  return (
    <div className="inline-flex flex-col items-end gap-1" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter") { e.preventDefault(); save(); } }}>
      <div className="inline-flex items-center gap-1">
        <button type="button" onClick={() => setVal((v) => Math.max(0, v - 1))} className="h-7 w-7 rounded-lg border border-line grid place-items-center hover:bg-cream"><Minus size={12} /></button>
        <input type="number" min={0} value={val} onChange={(e) => setVal(Math.max(0, Math.round(Number(e.target.value))))} autoFocus className="input !py-1 !px-1 w-16 text-center font-semibold" />
        <button type="button" onClick={() => setVal((v) => v + 1)} className="h-7 w-7 rounded-lg border border-line grid place-items-center hover:bg-cream"><Plus size={12} /></button>
        <button type="button" onClick={save} disabled={pending || diff === 0} className="h-7 px-2 rounded-lg bg-purple text-white inline-flex items-center gap-1 text-xs disabled:opacity-40">{pending ? <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Check size={12} />} บันทึก</button>
        <button type="button" onClick={() => setOpen(false)} className="h-7 w-7 rounded-lg grid place-items-center text-ink-soft hover:text-red"><X size={12} /></button>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold ${diff > 0 ? "text-green" : diff < 0 ? "text-red" : "text-ink-soft"}`}>{diff === 0 ? "ไม่เปลี่ยน" : `${diff > 0 ? "+" : ""}${diff}`}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (เช่น นับสต็อก, ของตัวอย่าง)" className="input !py-0.5 !px-2 text-[11px] w-52" />
      </div>
      {err && <div className="text-[11px] text-red">{err}</div>}
    </div>
  );
}
