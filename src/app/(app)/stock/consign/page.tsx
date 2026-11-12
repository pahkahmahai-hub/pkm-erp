import Link from "next/link";
import { Store, Plus, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import type { ConsignLocation } from "@/lib/stock/consign";
import { ConsignLocationForm } from "./ConsignLocationForm";

export const dynamic = "force-dynamic";

export default async function ConsignPage({ searchParams }: { searchParams: Promise<{ new?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: locs, error }, { data: stock }, { data: customers }] = await Promise.all([
    supabase.from("consign_locations").select("*").order("is_active", { ascending: false }).order("sort_order"),
    supabase.from("consign_stock").select("location_id, qty, products(price)").neq("qty", 0),
    session.isAdmin ? supabase.from("contacts").select("id, name, code").eq("kind", "customer").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
  ]);
  const list = (locs ?? []) as ConsignLocation[];
  const rows = (stock ?? []) as unknown as { location_id: string; qty: number; products: { price: number } | null }[];
  const sum = (id: string) => rows.filter((r) => r.location_id === id).reduce((a, r) => ({ qty: a.qty + r.qty, sku: a.sku + (r.qty > 0 ? 1 : 0), neg: a.neg + (r.qty < 0 ? 1 : 0), value: a.value + r.qty * Number(r.products?.price ?? 0) }), { qty: 0, sku: 0, neg: 0, value: 0 });

  return (
    <div className="space-y-5">
      <Header title="คลังฝากขาย" sub="ของที่ส่งไปฝากขายที่ห้าง (ใบส่งของชั่วคราว) — ยังเป็นของเรา ตัดออกเมื่อห้างขายได้และออกใบกำกับ"
        action={session.isAdmin && <Link href="/stock/consign?new=1" className="btn-primary"><Plus size={16} /> เพิ่มห้างฝากขาย</Link>} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">ยังไม่ได้รัน SQL 0024 — {error.message}</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {sp.new && session.isAdmin && <ConsignLocationForm customers={(customers ?? []) as { id: string; name: string; code: string | null }[]} />}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((l) => { const s = sum(l.id); return (
          <Link key={l.id} href={`/stock/consign/${l.id}`} className={`card p-5 hover:shadow-md transition ${l.is_active ? "" : "opacity-60"}`} style={{ borderTop: `4px solid ${l.color}` }}>
            <div className="flex items-center gap-2"><Store size={18} style={{ color: l.color }} /><h2 className="font-display font-bold text-lg">{l.name}</h2>{!l.is_active && <span className="badge-off">ปิด</span>}</div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div><div className="text-2xl font-display font-bold">{s.qty.toLocaleString()}</div><div className="text-[11px] text-ink-soft">ชิ้นที่อยู่ห้าง</div></div>
              <div><div className="text-2xl font-display font-bold">{s.sku}</div><div className="text-[11px] text-ink-soft">SKU</div></div>
              <div><div className="text-lg font-display font-bold">{s.value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</div><div className="text-[11px] text-ink-soft">มูลค่าราคาขาย</div></div>
            </div>
            {s.neg > 0 && <p className="mt-3 text-xs text-red flex items-center gap-1"><AlertTriangle size={12} /> {s.neg} SKU ติดลบ — ขายเกินที่ส่ง ควรกระทบยอด</p>}
            <p className="mt-2 text-[11px] text-ink-soft">ลูกค้าที่ผูก: {l.contact_ids.length} ราย</p>
          </Link>); })}
        {!list.length && !error && <div className="card p-6 text-ink-soft text-sm">ยังไม่มีห้างฝากขาย</div>}
      </div>
      <div className="card p-5 text-sm space-y-1.5 text-ink-soft">
        <div className="font-semibold text-ink">วิธีทำงาน</div>
        <div>1. ออก <b>ใบส่งของชั่วคราว</b> ให้ลูกค้าที่ผูกกับห้างฝากขาย → ระบบโอนของจากคลังหลักเข้าคลังห้าง (คลังหลักลด กันขายเกิน แต่ยังไม่ใช่ยอดขาย)</div>
        <div>2. ห้างส่งรายงานขายมา → ออก <b>ใบส่งสินค้า/ใบกำกับภาษี</b> (หรือนำเข้ารายงานขายห้าง) → ตัดจากคลังห้างตาม SKU ที่ขายได้จริง</div>
        <div>3. ขอรายงานคงเหลือจากจัดซื้อห้าง → <b>กระทบยอด</b> ในหน้าห้าง ส่วนต่างบันทึกเป็นการปรับยอด · ของที่ดึงกลับ → <b>รับคืน</b> เข้าคลังหลัก</div>
      </div>
    </div>
  );
}
