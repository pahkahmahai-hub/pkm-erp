"use client";

import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import type { Material } from "@/lib/stock/types";
import type { Bom, BomItem } from "@/lib/production/types";
import { KIND_TH } from "@/lib/production/types";

type MatLite = Pick<Material, "id" | "code" | "name" | "unit" | "kind" | "qty"> & { unit_cost?: number };
interface Line { key: string; material_id: string; name: string; unit: string; kind: Material["kind"]; mode: "pieces" | "qty"; pieces_per_unit: number; qty_per_piece: number; waste_pct: number; note: string; unit_cost: number }
const fmt = (n: number, d = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

export function BomEditor({ materials, bom, items, showCost, productName }: { materials: MatLite[]; bom: Bom | null; items: BomItem[]; showCost: boolean; productName: string }) {
  const [lines, setLines] = useState<Line[]>(items.map((i) => ({ key: i.id, material_id: i.material_id, name: i.materials?.name ?? "", unit: i.materials?.unit ?? "", kind: i.materials?.kind ?? "fabric", mode: i.pieces_per_unit ? "pieces" : "qty", pieces_per_unit: Number(i.pieces_per_unit ?? 0), qty_per_piece: Number(i.qty_per_piece), waste_pct: Number(i.waste_pct), note: i.note ?? "", unit_cost: Number(i.materials?.unit_cost ?? 0) })));
  const [q, setQ] = useState("");
  const [wage, setWage] = useState(Number(bom?.wage_per_piece ?? 0));
  const results = useMemo(() => { const s = q.trim().toLowerCase(); return s ? materials.filter((m) => m.name.toLowerCase().includes(s) || (m.code ?? "").toLowerCase().includes(s)).slice(0, 10) : []; }, [q, materials]);
  const add = (m: MatLite) => { if (lines.some((l) => l.material_id === m.id)) { setQ(""); return; } setLines((x) => [...x, { key: crypto.randomUUID(), material_id: m.id, name: m.name, unit: m.unit, kind: m.kind, mode: m.kind === "fabric" ? "pieces" : "qty", pieces_per_unit: m.kind === "fabric" ? 1 : 0, qty_per_piece: 1, waste_pct: 0, note: "", unit_cost: Number(m.unit_cost ?? 0) }]); setQ(""); };
  const upd = (key: string, patch: Partial<Line>) => setLines((x) => x.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const eff = (l: Line) => (l.mode === "pieces" ? (l.pieces_per_unit > 0 ? 1 / l.pieces_per_unit : 0) : l.qty_per_piece) * (1 + l.waste_pct / 100);
  const matCost = lines.reduce((a, l) => a + eff(l) * l.unit_cost, 0);
  return (
    <div className="space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ material_id: l.material_id, pieces_per_unit: l.mode === "pieces" ? l.pieces_per_unit : null, qty_per_piece: l.mode === "pieces" ? null : l.qty_per_piece, waste_pct: l.waste_pct, note: l.note || null })))} />
      <div className="card p-5 grid sm:grid-cols-3 gap-4">
        <div><label className="label">ชื่อสูตร</label><input name="name" defaultValue={bom?.name ?? "มาตรฐาน"} className="input" /></div>
        <div><label className="label">ค่าจ้างผลิตมาตรฐาน / ชิ้น (บาท)</label><input type="number" step="0.01" name="wage_per_piece" value={wage} onChange={(e) => setWage(Number(e.target.value))} className="input" /></div>
        <div><label className="label">หมายเหตุ</label><input name="note" defaultValue={bom?.note ?? ""} className="input" placeholder="เช่น ใช้ผ้าลายไหนก็ได้ในกลุ่มตาหมากรุก" /></div>
      </div>
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-bold">วัสดุต่อ {productName} 1 ชิ้น</h2>
          <div className="relative w-96"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-8" placeholder="เพิ่มวัสดุ: ค้นหาลายผ้า / แพคเกจจิ้ง / อุปกรณ์…" />
            {results.length > 0 && <div className="absolute z-10 right-0 mt-1 w-full card p-1 max-h-64 overflow-auto">{results.map((m) => <button key={m.id} type="button" onClick={() => add(m)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{m.name}<div className="text-[11px] text-ink-soft">{KIND_TH[m.kind]} · {m.code ?? "—"} · คงเหลือ {Number(m.qty)} {m.unit}</div></button>)}</div>}</div>
        </div>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>วัสดุ</th><th className="w-[300px]">ปริมาณต่อชิ้น</th><th className="w-24 text-right">เผื่อเสีย %</th><th className="w-32 text-right">ใช้จริง/ชิ้น</th>{showCost && <th className="w-28 text-right">ต้นทุน/ชิ้น</th>}<th className="w-40">หมายเหตุ</th><th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.key}>
              <td><div className="font-medium">{l.name}</div><div className="text-[11px] text-ink-soft">{KIND_TH[l.kind]} · หน่วย {l.unit}</div></td>
              <td>
                {l.kind === "fabric" && <div className="flex items-center gap-2 text-xs mb-1"><label className="flex items-center gap-1"><input type="radio" checked={l.mode === "pieces"} onChange={() => upd(l.key, { mode: "pieces" })} /> ผืนละกี่ชิ้น</label><label className="flex items-center gap-1"><input type="radio" checked={l.mode === "qty"} onChange={() => upd(l.key, { mode: "qty" })} /> ผืนต่อชิ้น</label></div>}
                {l.mode === "pieces" ? <div className="flex items-center gap-2 text-sm">1 {l.unit} ทำได้ <input type="number" step="0.5" min={0.5} value={l.pieces_per_unit} onChange={(e) => upd(l.key, { pieces_per_unit: Number(e.target.value) })} className="input !py-1 w-24 text-right" /> ชิ้น</div>
                  : <div className="flex items-center gap-2 text-sm"><input type="number" step="0.0001" min={0} value={l.qty_per_piece} onChange={(e) => upd(l.key, { qty_per_piece: Number(e.target.value) })} className="input !py-1 w-28 text-right" /> {l.unit} / ชิ้น</div>}
              </td>
              <td><input type="number" step="0.5" min={0} value={l.waste_pct} onChange={(e) => upd(l.key, { waste_pct: Number(e.target.value) })} className="input !py-1 text-right" /></td>
              <td className="text-right font-semibold">{fmt(eff(l), 4)} <span className="text-xs font-normal text-ink-soft">{l.unit}</span></td>
              {showCost && <td className="text-right">{fmt(eff(l) * l.unit_cost)}</td>}
              <td><input value={l.note} onChange={(e) => upd(l.key, { note: e.target.value })} className="input !py-1 text-xs" /></td>
              <td><button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} className="text-ink-soft hover:text-red"><Trash2 size={14} /></button></td>
            </tr>))}
            {!lines.length && <tr><td colSpan={showCost ? 7 : 6} className="text-center text-ink-soft py-6">ยังไม่มีวัสดุ — ค้นหาด้านบนเพื่อเพิ่ม</td></tr>}
          </tbody>
          {showCost && lines.length > 0 && <tfoot><tr className="font-semibold"><td colSpan={4} className="text-right">ต้นทุนวัสดุ/ชิ้น (โดยประมาณ)</td><td className="text-right">{fmt(matCost)}</td><td colSpan={2} className="text-xs text-ink-soft">+ ค่าจ้าง {fmt(wage)} = <b>{fmt(matCost + wage)}</b> บาท/ชิ้น</td></tr></tfoot>}
        </table></div>
        <p className="text-[11px] text-ink-soft">ใบสั่งผลิตจะคำนวณวัสดุที่ต้องเบิก = จำนวนสั่ง × ใช้จริง/ชิ้น (ปัดขึ้นเป็นทศนิยม 2 ตำแหน่ง) และแก้จำนวนเบิกจริงได้ก่อนตัดสต็อก</p>
      </div>
    </div>
  );
}
