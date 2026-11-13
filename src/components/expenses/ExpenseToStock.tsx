"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus } from "lucide-react";
import { expenseToStock, type StockLineIn } from "@/app/(app)/expenses/actions";

type Item = { id: string; description: string; qty: number; unit: string | null; unit_price: number; amount: number; stocked_at: string | null; stocked_qty: number | null; material_id: string | null; product_id: string | null };
type Mat = { id: string; kind: string; name: string; code: string | null; unit: string; qty: number };
type Prod = { id: string; code: string; name: string };
type Target = "skip" | "product" | "packaging" | "accessory" | "display" | "fabric";
const TARGETS: [Target, string][] = [["skip", "— ไม่เข้าสต็อก —"], ["product", "สินค้า (คลังใหญ่)"], ["packaging", "แพคเกจจิ้ง"], ["accessory", "อุปกรณ์"], ["display", "อุปกรณ์ Display"], ["fabric", "ลายผ้า"]];

export function ExpenseToStock({ expenseId, expNo, items, materials, products, defaultTarget }: { expenseId: string; expNo: string; items: Item[]; materials: Mat[]; products: Prod[]; defaultTarget: Target }) {
  const router = useRouter();
  const pending = items.filter((i) => !i.stocked_at);
  const [rows, setRows] = useState(() => Object.fromEntries(pending.map((i) => [i.id, { target: (i.product_id ? "product" : i.material_id ? (materials.find((m) => m.id === i.material_id)?.kind as Target) ?? defaultTarget : defaultTarget) as Target, pick: i.product_id ?? i.material_id ?? "new", name: i.description, unit: i.unit ?? "ชิ้น", qty: Number(i.qty) }])));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null);
  const set = (id: string, patch: Partial<(typeof rows)[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const save = async () => {
    setErr(null); setBusy(true);
    const lines: StockLineIn[] = [];
    for (const i of pending) {
      const r = rows[i.id]; if (r.target === "skip") continue;
      if (r.target === "product") { if (r.pick === "new" || !r.pick) { setBusy(false); setErr(`เลือกสินค้าให้ "${i.description}" (สินค้าใหม่ต้องสร้างในเมนูคลังใหญ่ก่อน)`); return; } lines.push({ item_id: i.id, target: "product", product_id: r.pick, qty: r.qty }); }
      else lines.push({ item_id: i.id, target: "material", material_id: r.pick === "new" ? null : r.pick, kind: r.target, new_name: r.name, unit: r.unit, qty: r.qty });
    }
    if (!lines.length) { setBusy(false); setErr("ยังไม่ได้เลือกรายการที่จะเข้าสต็อก"); return; }
    const res = await expenseToStock(expenseId, lines);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`บันทึกเข้าสต็อกแล้ว — วัสดุ ${res.materials} รายการ · สินค้า ${res.products} รายการ`);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {items.filter((i) => i.stocked_at).length > 0 && (
        <div className="card p-4 text-sm"><div className="font-semibold mb-1">เข้าสต็อกแล้ว</div>
          <ul className="text-ink-soft space-y-0.5">{items.filter((i) => i.stocked_at).map((i) => <li key={i.id}>✓ {i.description} — {Number(i.stocked_qty ?? i.qty)} {i.unit ?? ""} → {i.product_id ? "สินค้า " + (products.find((p) => p.id === i.product_id)?.name ?? "") : materials.find((m) => m.id === i.material_id)?.name ?? ""}</li>)}</ul>
        </div>
      )}
      {pending.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="tbl text-sm">
            <thead><tr><th>รายการในบิล {expNo}</th><th className="w-44">เข้าสต็อกเป็น</th><th className="min-w-[240px]">รายการในคลัง</th><th className="w-24 text-right">จำนวน</th></tr></thead>
            <tbody>
              {pending.map((i) => { const r = rows[i.id]; const opts = r.target === "product" ? products.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` })) : materials.filter((m) => m.kind === r.target).map((m) => ({ id: m.id, label: `${m.code ? m.code + " · " : ""}${m.name} (คงเหลือ ${Number(m.qty)} ${m.unit})` }));
                return (
                  <tr key={i.id} className={r.target === "skip" ? "opacity-50" : ""}>
                    <td><div className="font-medium">{i.description}</div><div className="text-[11px] text-ink-soft">{Number(i.qty)} {i.unit ?? ""} × {Number(i.unit_price).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</div></td>
                    <td><select value={r.target} onChange={(e) => set(i.id, { target: e.target.value as Target, pick: e.target.value === "product" ? "" : "new" })} className="input py-1">{TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                    <td>{r.target === "skip" ? <span className="text-xs text-ink-soft">—</span> : (
                      <div className="space-y-1">
                        <select value={r.pick} onChange={(e) => set(i.id, { pick: e.target.value })} className="input py-1">
                          {r.target === "product" ? <option value="">— เลือกสินค้า —</option> : <option value="new">+ สร้างรายการใหม่</option>}
                          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        {r.target !== "product" && r.pick === "new" && <div className="flex gap-1"><input value={r.name} onChange={(e) => set(i.id, { name: e.target.value })} className="input py-1 text-xs flex-1" placeholder="ชื่อรายการใหม่" /><input value={r.unit} onChange={(e) => set(i.id, { unit: e.target.value })} className="input py-1 text-xs w-16" placeholder="หน่วย" /></div>}
                      </div>)}</td>
                    <td className="text-right"><input type="number" step="0.01" value={r.qty} onChange={(e) => set(i.id, { qty: Number(e.target.value) })} className="input py-1 text-right" disabled={r.target === "skip"} /></td>
                  </tr>); })}
            </tbody>
          </table>
        </div>
      ) : <div className="card p-6 text-center text-ink-soft text-sm">ทุกรายการในบิลนี้เข้าสต็อกแล้ว</div>}
      {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{err}</div>}
      {ok && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">{ok}</div>}
      {pending.length > 0 && <button disabled={busy} onClick={save} className="btn-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />} บันทึกเข้าสต็อก</button>}
      <p className="text-[11px] text-ink-soft">ต้นทุนต่อหน่วยคิดจากราคาในบิล (ไม่รวม VAT) และเฉลี่ยกับของเดิมในคลัง · รายการที่เข้าแล้วจะไม่เข้าซ้ำ · สินค้าใหม่ต้องสร้างในเมนูคลังใหญ่ก่อน (ต้องมีรหัสสินค้า)</p>
    </div>
  );
}
