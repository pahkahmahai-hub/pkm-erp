"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import type { Product, DefectStatus } from "@/lib/stock/types";

export interface LineItem {
  key: string;
  product_id: string;
  code: string;
  name: string;
  stock_qty: number;
  qty: number;
  condition?: "good" | "defect";
  defect_action?: DefectStatus;
  unit_cost?: string;
  note?: string;
}

type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "stock_qty" | "unit">;

export function LineItemsEditor({
  products, items, onChange, mode, showCost = false,
}: {
  products: ProductLite[];
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  mode: "receive" | "issue";
  showCost?: boolean;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products
      .filter((p) => p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s))
      .slice(0, 8);
  }, [q, products]);

  function add(p: ProductLite) {
    if (items.some((i) => i.product_id === p.id && (mode === "issue" || i.condition === "good"))) {
      onChange(items.map((i) => (i.product_id === p.id && (mode === "issue" || i.condition === "good") ? { ...i, qty: i.qty + 1 } : i)));
    } else {
      onChange([...items, { key: crypto.randomUUID(), product_id: p.id, code: p.code, name: p.name, stock_qty: p.stock_qty, qty: 1, condition: "good", defect_action: "review" }]);
    }
    setQ("");
  }
  function update(key: string, patch: Partial<LineItem>) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function remove(key: string) {
    onChange(items.filter((i) => i.key !== key));
  }

  // barcode scanner support: Enter with an exact barcode/code match adds immediately
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const s = q.trim().toLowerCase();
      const exact = products.find((p) => p.barcode === s || p.code.toLowerCase() === s) ?? results[0];
      if (exact) add(exact);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-ink-soft" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} className="input pl-9" placeholder="พิมพ์ชื่อ / รหัส / ยิงบาร์โค้ด แล้วกด Enter" />
        {results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full card divide-y divide-line max-h-72 overflow-auto">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="w-full text-left px-3 py-2 hover:bg-cream text-sm flex justify-between gap-3">
                  <span><span className="font-mono text-xs text-ink-soft mr-2">{p.code}</span>{p.name}</span>
                  <span className="text-xs text-ink-soft whitespace-nowrap">คงเหลือ {p.stock_qty}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th className="w-24">จำนวน</th>
                {mode === "receive" && <th className="w-40">สภาพ</th>}
                {mode === "receive" && showCost && <th className="w-28">ต้นทุน/หน่วย</th>}
                <th>หมายเหตุ</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const over = mode === "issue" && i.qty > i.stock_qty;
                return (
                  <tr key={i.key}>
                    <td>
                      <div className="font-medium">{i.name}</div>
                      <div className="text-xs text-ink-soft font-mono">{i.code} · คงเหลือ {i.stock_qty}</div>
                    </td>
                    <td>
                      <input type="number" min={1} value={i.qty} onChange={(e) => update(i.key, { qty: Math.max(1, Number(e.target.value)) })} className={`input ${over ? "border-red" : ""}`} />
                      {over && <div className="text-[11px] text-red mt-1">เกินสต็อก</div>}
                    </td>
                    {mode === "receive" && (
                      <td>
                        <select value={i.condition} onChange={(e) => update(i.key, { condition: e.target.value as "good" | "defect" })} className="input">
                          <option value="good">สินค้าดี → เข้าคลัง</option>
                          <option value="defect">สินค้าเสีย</option>
                        </select>
                        {i.condition === "defect" && (
                          <select value={i.defect_action} onChange={(e) => update(i.key, { defect_action: e.target.value as DefectStatus })} className="input mt-1">
                            <option value="review">รอพิจารณา</option>
                            <option value="return_pending">รอส่งคืน</option>
                          </select>
                        )}
                      </td>
                    )}
                    {mode === "receive" && showCost && (
                      <td><input type="number" step="0.01" value={i.unit_cost ?? ""} onChange={(e) => update(i.key, { unit_cost: e.target.value })} className="input" placeholder="—" /></td>
                    )}
                    <td><input value={i.note ?? ""} onChange={(e) => update(i.key, { note: e.target.value })} className="input" /></td>
                    <td><button type="button" onClick={() => remove(i.key)} className="text-red" aria-label="ลบ"><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items.length === 0 && <p className="text-xs text-ink-soft flex items-center gap-1"><Plus size={12} /> ค้นหาสินค้าด้านบนเพื่อเพิ่มรายการ</p>}
    </div>
  );
}
