"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { todayBkk } from "@/lib/today";

type P = { id: string; code: string; name: string; unit: string; barcode: string | null };

/** reconcile: กรอกยอดคงเหลือตามรายงานห้าง (วางจาก Excel ได้: รหัส/บาร์โค้ด <tab> จำนวน) · return: กรอกจำนวนที่รับคืน */
export function ConsignQtyForm({ mode, action, products, balances }: { mode: "reconcile" | "return"; action: (fd: FormData) => Promise<void>; products: P[]; balances: Record<string, number> }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [onlyAtStore, setOnlyAtStore] = useState(true);
  const [q, setQ] = useState("");
  const [paste, setPaste] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => (!onlyAtStore || balances[p.id] !== undefined || vals[p.id] !== undefined) && (!s || p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s)));
  }, [products, balances, onlyAtStore, q, vals]);
  const applyPaste = () => {
    const byKey = new Map<string, P>(); for (const p of products) { byKey.set(p.code.toLowerCase(), p); if (p.barcode) byKey.set(p.barcode, p); }
    const next = { ...vals }; const miss: string[] = [];
    for (const line of paste.split(/\r?\n/)) {
      const cells = line.split(/\t|,|;/).map((c) => c.trim()).filter(Boolean); if (cells.length < 2) continue;
      const qty = Number(cells[cells.length - 1].replace(/,/g, "")); if (!Number.isFinite(qty)) continue;
      const p = cells.slice(0, -1).map((c) => byKey.get(c.toLowerCase()) ?? byKey.get(c)).find(Boolean);
      if (p) next[p.id] = String(qty); else miss.push(cells[0]);
    }
    setVals(next); setUnmatched(miss); setPaste("");
  };
  const items = Object.entries(vals).filter(([, v]) => v !== "" && Number.isFinite(Number(v))).map(([product_id, v]) => ({ product_id, qty: Math.trunc(Number(v)) })).filter((i) => mode === "reconcile" || i.qty > 0);
  const diffs = mode === "reconcile" ? items.filter((i) => i.qty !== (balances[i.product_id] ?? 0)).length : items.length;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="card p-5 grid sm:grid-cols-3 gap-4">
        {mode === "return" && <div><label className="label">วันที่รับคืน</label><input type="date" name="date" defaultValue={todayBkk()} className="input" /></div>}
        <div><label className="label">{mode === "reconcile" ? "อ้างอิงรายงาน" : "เลขที่เอกสารคืน (ถ้ามี)"}</label><input name="ref" className="input" placeholder={mode === "reconcile" ? "เช่น Stock ห้าง 30/11/2026" : "เช่น ใบคืนสินค้าห้าง"} /></div>
        <div className={mode === "reconcile" ? "sm:col-span-2" : ""}><label className="label">หมายเหตุ</label><input name="note" className="input" placeholder={mode === "reconcile" ? "เช่น ของหาย/ชำรุดที่ห้าง" : "เช่น ดึงกลับเปลี่ยนคอลเลกชัน"} /></div>
        <p className="sm:col-span-3 text-xs text-ink-soft">{mode === "reconcile"
          ? "กรอก \"ยอดคงเหลือตามห้าง\" เฉพาะ SKU ที่ห้างรายงาน ระบบจะปรับคลังห้างให้ตรง (ช่องว่าง = ไม่แตะ) — คลังหลักไม่เปลี่ยน"
          : "จำนวนที่กรอกจะถูกโอนจากคลังห้างกลับเข้าคลังหลัก (รับคืนเกินยอดที่อยู่ห้างไม่ได้)"}</p>
      </div>
      {mode === "reconcile" && (
        <div className="card p-5 space-y-2">
          <label className="label flex items-center gap-1"><ClipboardPaste size={14} /> วางจาก Excel รายงานคงเหลือห้าง (คอลัมน์: รหัสสินค้าหรือบาร์โค้ด … จำนวน)</label>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} className="input font-mono text-xs" placeholder={"8859xxxxxxx\t12\nBAH\t5"} />
          <div className="flex items-center gap-3"><button type="button" onClick={applyPaste} disabled={!paste.trim()} className="btn-outline py-1.5">ใส่ตัวเลขลงตาราง</button>{unmatched.length > 0 && <span className="text-xs text-red">หาไม่เจอ {unmatched.length} รายการ: {unmatched.slice(0, 6).join(", ")}{unmatched.length > 6 ? "…" : ""}</span>}</div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-line">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input max-w-xs" placeholder="ค้นหารหัส / ชื่อ / บาร์โค้ด" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyAtStore} onChange={(e) => setOnlyAtStore(e.target.checked)} className="accent-purple" /> เฉพาะสินค้าที่มีอยู่ห้าง</label>
        </div>
        <table className="tbl">
          <thead><tr><th>รหัส</th><th>สินค้า</th><th className="text-right">ในระบบ (ห้าง)</th><th className="w-36 text-right">{mode === "reconcile" ? "ตามรายงานห้าง" : "รับคืน"}</th>{mode === "reconcile" && <th className="text-right w-24">ส่วนต่าง</th>}</tr></thead>
          <tbody>
            {list.slice(0, 400).map((p) => { const bal = balances[p.id] ?? 0; const v = vals[p.id] ?? ""; const d = v === "" ? null : Number(v) - bal; return (
              <tr key={p.id}><td className="font-mono text-xs">{p.code}</td><td>{p.name}</td><td className={`text-right ${bal < 0 ? "text-red" : ""}`}>{bal}</td>
                <td><input type="number" min={mode === "return" ? 0 : undefined} max={mode === "return" ? Math.max(bal, 0) : undefined} value={v} onChange={(e) => setVals((x) => ({ ...x, [p.id]: e.target.value }))} className="input !py-1 text-right" /></td>
                {mode === "reconcile" && <td className={`text-right font-semibold ${d === null || d === 0 ? "text-ink-soft" : d < 0 ? "text-red" : "text-green"}`}>{d === null ? "" : d > 0 ? `+${d}` : d}</td>}</tr>); })}
            {!list.length && <tr><td colSpan={5} className="text-center text-ink-soft py-6">ไม่มีสินค้า — เอาติ๊ก &quot;เฉพาะสินค้าที่มีอยู่ห้าง&quot; ออกเพื่อเลือกสินค้าอื่น</td></tr>}
          </tbody>
        </table>
      </div>
      <button className="btn-primary" disabled={!diffs}>{mode === "reconcile" ? `ปรับคลังห้างตามรายงาน (${diffs} รายการต่าง)` : `รับคืนเข้าคลังหลัก (${diffs} รายการ)`}</button>
    </form>
  );
}
