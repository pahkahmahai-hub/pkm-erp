"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { OnlineChannel, OnlineDaily, OnlineItem } from "@/lib/sales/types";
import type { Product } from "@/lib/stock/types";
import { saveOnlineChannelDay } from "@/app/(app)/sales/actions";

type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "price" | "unit">;
interface Line { key: string; product_id: string | null; description: string; barcode: string; qty: number; unit_price: number; order_ref: string }
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OnlineDayEditor({ date, channels, products, items, daily, openKey }: { date: string; channels: OnlineChannel[]; products: ProductLite[]; items: OnlineItem[]; daily: OnlineDaily[]; openKey?: string }) {
  const [open, setOpen] = useState<string | null>(openKey ?? null);
  return (
    <div className="space-y-3">
      {channels.map((c) => {
        const its = items.filter((i) => i.channel === c.key);
        const d = daily.find((x) => x.channel === c.key);
        const qty = its.reduce((a, i) => a + Number(i.qty), 0); const gross = its.reduce((a, i) => a + Number(i.amount), 0);
        const isOpen = open === c.key;
        return (
          <div key={c.key} className="card overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? null : c.key)} className="w-full flex flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-cream/60">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              <b className="w-44">{c.name}</b>
              {c.bills_to_tks && <span className="badge-ok">ออกบิลในนาม TKS</span>}
              <span className="text-sm text-ink-soft ml-auto">{its.length ? `${its.length} รายการ · ${qty} ชิ้น · ฿${fmt(gross)}` : "ยังไม่บันทึก"}{d && Number(d.fees) ? ` · ค่าธรรมเนียม ${fmt(Number(d.fees))}` : ""}{d && Number(d.payout_amount) ? ` · ได้รับ ${fmt(Number(d.payout_amount))}` : ""}</span>
              {d?.recorded_tks && <span className="badge-off">TKS</span>}
              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && <ChannelForm date={date} channel={c} products={products} items={its} daily={d} />}
          </div>
        );
      })}
    </div>
  );
}

function ChannelForm({ date, channel, products, items, daily }: { date: string; channel: OnlineChannel; products: ProductLite[]; items: OnlineItem[]; daily?: OnlineDaily }) {
  const [lines, setLines] = useState<Line[]>(items.map((i) => ({ key: i.id, product_id: i.product_id, description: i.description ?? "", barcode: i.barcode ?? "", qty: Number(i.qty), unit_price: Number(i.unit_price) || (Number(i.amount) / Number(i.qty) || 0), order_ref: i.order_ref ?? "" })));
  const [q, setQ] = useState("");
  const results = useMemo(() => { const s = q.trim().toLowerCase(); return s ? products.filter((p) => p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.barcode ?? "").includes(s)).slice(0, 8) : []; }, [q, products]);
  function add(p: ProductLite) {
    setLines((l) => { const ex = l.find((x) => x.product_id === p.id); if (ex) return l.map((x) => (x === ex ? { ...x, qty: x.qty + 1 } : x)); return [...l, { key: crypto.randomUUID(), product_id: p.id, description: p.name, barcode: p.barcode ?? "", qty: 1, unit_price: Number(p.price), order_ref: "" }]; });
    setQ("");
  }
  const upd = (key: string, patch: Partial<Line>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const gross = lines.reduce((a, l) => a + Math.round(l.qty * l.unit_price * 100) / 100, 0);
  return (
    <form action={saveOnlineChannelDay} className="border-t border-line p-5 space-y-4">
      <input type="hidden" name="sale_date" value={date} /><input type="hidden" name="channel" value={channel.key} />
      <input type="hidden" name="items" value={JSON.stringify(lines.filter((l) => l.description && l.qty > 0).map(({ product_id, description, barcode, qty, unit_price, order_ref }) => ({ product_id, description, barcode: barcode || null, qty, unit_price, order_ref: order_ref || null })))} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-96"><Search size={14} className="absolute left-3 top-3 text-ink-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-8" placeholder="ค้นหาสินค้าที่ขายได้ — ชื่อ / รหัส / บาร์โค้ด" />
          {results.length > 0 && <div className="absolute z-10 mt-1 w-full card p-1 max-h-64 overflow-auto">{results.map((p) => <button key={p.id} type="button" onClick={() => add(p)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{p.name}<div className="text-[11px] text-ink-soft">{p.code} · {p.barcode} · ฿{fmt(Number(p.price))}</div></button>)}</div>}</div>
        <button type="button" onClick={() => setLines((l) => [...l, { key: crypto.randomUUID(), product_id: null, description: "", barcode: "", qty: 1, unit_price: 0, order_ref: "" }])} className="btn-ghost text-xs"><Plus size={14} /> บรรทัดว่าง</button>
      </div>
      <div className="overflow-x-auto"><table className="tbl">
        <thead><tr><th>สินค้า</th><th className="w-24 text-right">จำนวน</th><th className="w-32 text-right">ราคาขาย/ชิ้น</th><th className="w-32 text-right">ยอด</th><th className="w-40">เลขออเดอร์ (ถ้ามี)</th><th /></tr></thead>
        <tbody>
          {lines.map((l) => <tr key={l.key}>
            <td>{l.product_id ? <div><div className="font-medium">{l.description}</div><div className="text-[11px] text-ink-soft font-mono">{l.barcode}</div></div> : <input value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} className="input" placeholder="ชื่อสินค้า (ไม่อยู่ในระบบ)" />}</td>
            <td><input type="number" min={0} step="1" value={l.qty} onChange={(e) => upd(l.key, { qty: Number(e.target.value) })} className="input text-right" /></td>
            <td><input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => upd(l.key, { unit_price: Number(e.target.value) })} className="input text-right" /></td>
            <td className="text-right font-semibold">{fmt(Math.round(l.qty * l.unit_price * 100) / 100)}</td>
            <td><input value={l.order_ref} onChange={(e) => upd(l.key, { order_ref: e.target.value })} className="input" /></td>
            <td><button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} className="text-ink-soft hover:text-red"><Trash2 size={14} /></button></td>
          </tr>)}
          {!lines.length && <tr><td colSpan={6} className="text-center text-ink-soft py-6">พิมพ์ชื่อสินค้าด้านบนเพื่อเพิ่มรายการที่ขายได้วันนี้</td></tr>}
        </tbody>
        {lines.length > 0 && <tfoot><tr className="font-bold"><td>รวม {lines.reduce((a, l) => a + l.qty, 0)} ชิ้น</td><td /><td /><td className="text-right">{fmt(gross)}</td><td colSpan={2} /></tr></tfoot>}
      </table></div>
      <div className="grid sm:grid-cols-[110px_150px_170px_1fr] gap-3 items-end">
        <div><label className="label">จำนวนออเดอร์</label><input name="orders" type="number" min={0} defaultValue={daily?.orders_count ?? ""} className="input" /></div>
        <div><label className="label">ค่าธรรมเนียมแพลตฟอร์ม</label><input name="fees" type="number" step="0.01" min={0} defaultValue={daily?.fees ?? ""} className="input text-right" /></div>
        <div><label className="label">เงินที่ได้รับจากแพลตฟอร์ม</label><input name="payout" type="number" step="0.01" min={0} defaultValue={daily?.payout_amount ?? ""} className="input text-right" placeholder="ยอดโอนเข้าบัญชีจริง" /></div>
        <div><label className="label">หมายเหตุ</label><input name="note" defaultValue={daily?.note ?? ""} className="input" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="recorded_tks" defaultChecked={daily?.recorded_tks ?? channel.bills_to_tks} className="accent-purple" /> บันทึกเข้า TKS (ออกบิลในนามทีฆาซอร์ส)</label>
        <button className="btn-primary ml-auto">บันทึก {channel.name}</button>
      </div>
    </form>
  );
}
