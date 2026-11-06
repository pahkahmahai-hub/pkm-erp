import Link from "next/link";
import { PackagePlus, PackageMinus, AlertTriangle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header, Stat } from "@/components/ui";
import { fmtDate, fmtDateTime, todayBkk } from "@/lib/format";
import { MOVEMENT_TH, type Movement, type Product } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "today", label: "วันนี้", days: 0 },
  { key: "7d", label: "7 วัน", days: 6 },
  { key: "15d", label: "15 วัน", days: 14 },
  { key: "month", label: "เดือนนี้", days: -1 },
];

export default async function StockDashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "7d" } = await searchParams;
  const supabase = await createClient();
  const today = todayBkk();
  const r = RANGES.find((x) => x.key === range) ?? RANGES[1];
  const from = r.days < 0 ? today.slice(0, 8) + "01" : new Date(new Date(today).getTime() - r.days * 86400000).toISOString().slice(0, 10);

  const [{ data: sum }, { data: low }, { data: recent }, { data: totals }, { data: defects }] = await Promise.all([
    supabase.rpc("stock_summary", { p_from: from, p_to: today }).single(),
    supabase.from("products").select("id, code, name, stock_qty, min_alert").eq("is_active", true).gt("min_alert", 0).order("stock_qty").limit(200),
    supabase.from("stock_movements").select("*, products(code, name, barcode), app_users(display_name, email)").gte("created_at", from + "T00:00:00+07:00").order("created_at", { ascending: false }).limit(15),
    supabase.from("products").select("stock_qty, defect_qty, price, is_active"),
    supabase.from("defects").select("id, status").in("status", ["review", "return_pending"]),
  ]);
  const s = (sum ?? {}) as { received: number; issued: number; defects_in: number; adjustments: number; issues_count: number; receipts_count: number };
  const lowStock = ((low ?? []) as Pick<Product, "id" | "code" | "name" | "stock_qty" | "min_alert">[]).filter((p) => p.stock_qty <= p.min_alert);
  const active = (totals ?? []).filter((t) => t.is_active);
  const totalQty = active.reduce((a, t) => a + t.stock_qty, 0);
  const totalValue = active.reduce((a, t) => a + t.stock_qty * Number(t.price), 0);

  return (
    <div className="space-y-6">
      <Header title="แดชบอร์ดคลังใหญ่" sub={`${fmtDate(from)} – ${fmtDate(today)}`} action={
        <div className="flex gap-2">
          <Link href="/stock/receipts/new" className="btn-primary"><PackagePlus size={16} /> รับเข้า</Link>
          <Link href="/stock/issues/new" className="btn-outline"><PackageMinus size={16} /> ใบเบิก</Link>
        </div>
      } />

      <div className="flex gap-2 flex-wrap">
        {RANGES.map((x) => (
          <Link key={x.key} href={`/stock?range=${x.key}`} className={x.key === r.key ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>{x.label}</Link>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={`รับเข้า (${s.receipts_count ?? 0} ใบ)`} value={s.received ?? 0} tone="teal" href="/stock/receipts" />
        <Stat label={`เบิกออก (${s.issues_count ?? 0} ใบ)`} value={s.issued ?? 0} tone="purple" href="/stock/issues" />
        <Stat label="ของเสียรับเข้า" value={s.defects_in ?? 0} tone="coral" href="/stock/defects" />
        <Stat label="ปรับยอด (ครั้ง)" value={s.adjustments ?? 0} tone="yellow" href="/stock/movements" />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-4"><div className="text-xs text-ink-soft font-semibold">สินค้าคงคลังทั้งหมด</div><div className="font-display text-2xl font-bold">{totalQty.toLocaleString()} <span className="text-sm font-normal text-ink-soft">ชิ้น</span></div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft font-semibold">มูลค่าตามราคาขาย</div><div className="font-display text-2xl font-bold">฿{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft font-semibold">ของเสียค้างพิจารณา/รอส่งคืน</div><div className="font-display text-2xl font-bold">{defects?.length ?? 0} <span className="text-sm font-normal text-ink-soft">รายการ</span></div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3 flex items-center gap-2"><AlertTriangle size={18} className="text-[#8a6a00]" /> สินค้าใกล้หมด ({lowStock.length})</h2>
          <table className="tbl">
            <thead><tr><th>รหัส</th><th>สินค้า</th><th className="text-right">คงเหลือ</th><th className="text-right">ขั้นต่ำ</th></tr></thead>
            <tbody>
              {lowStock.slice(0, 12).map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td><Link href={`/stock/products/${p.id}`} className="text-purple hover:underline">{p.name}</Link></td>
                  <td className={`text-right font-semibold ${p.stock_qty === 0 ? "text-red" : ""}`}>{p.stock_qty}</td>
                  <td className="text-right text-ink-soft">{p.min_alert}</td>
                </tr>
              ))}
              {!lowStock.length && <tr><td colSpan={4} className="text-center text-ink-soft py-6">ไม่มีสินค้าต่ำกว่าขั้นต่ำ</td></tr>}
            </tbody>
          </table>
          {lowStock.length > 12 && <Link href="/stock/products?filter=low" className="text-xs text-purple font-semibold mt-2 inline-flex items-center gap-1">ดูทั้งหมด <ArrowRight size={12} /></Link>}
        </section>

        <section className="card p-5">
          <h2 className="font-display font-bold mb-3">เคลื่อนไหวล่าสุด</h2>
          <ul className="divide-y divide-line text-sm">
            {((recent ?? []) as Movement[]).map((m) => (
              <li key={m.id} className="py-2 flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate"><span className="badge-off mr-1">{MOVEMENT_TH[m.movement_type]}</span>{m.products?.name}</div>
                  <div className="text-xs text-ink-soft">{fmtDateTime(m.created_at)} · {m.app_users?.display_name ?? "ระบบ"}{m.ref_no ? ` · ${m.ref_no}` : ""}</div>
                </div>
                <div className={`font-semibold whitespace-nowrap ${m.qty < 0 ? "text-red" : m.qty > 0 ? "text-green" : "text-ink-soft"}`}>{m.qty > 0 ? "+" : ""}{m.qty !== 0 ? m.qty : `${m.defect_delta > 0 ? "+" : ""}${m.defect_delta} เสีย`}</div>
              </li>
            ))}
            {!recent?.length && <li className="py-6 text-center text-ink-soft">ยังไม่มีรายการในช่วงนี้</li>}
          </ul>
          <Link href="/stock/movements" className="text-xs text-purple font-semibold mt-2 inline-flex items-center gap-1">ดูประวัติทั้งหมด <ArrowRight size={12} /></Link>
        </section>
      </div>
    </div>
  );
}
