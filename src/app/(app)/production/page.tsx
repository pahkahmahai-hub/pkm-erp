import Link from "next/link";
import { Plus, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { MO_STATUS_TH, MO_STATUS_BADGE, type ProductionOrder, type MoStatus } from "@/lib/production/types";

export const dynamic = "force-dynamic";
const TABS: { key: string; label: string }[] = [{ key: "", label: "ทั้งหมด" }, { key: "draft", label: "ร่าง" }, { key: "issued", label: "รอผลิต" }, { key: "partial", label: "รับบางส่วน" }, { key: "completed", label: "เสร็จสิ้น" }, { key: "cancelled", label: "ยกเลิก" }];

export default async function ProductionHome({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "", q = "" } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  let query = supabase.from("production_orders").select("*, production_order_items(qty_ordered, qty_received, qty_defect, products(name))").order("doc_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`doc_no.ilike.%${q}%,factory_name.ilike.%${q}%`);
  const [{ data: sum }, { data: rows }] = await Promise.all([supabase.rpc("production_summary"), query]);
  type Row = ProductionOrder & { production_order_items: { qty_ordered: number; qty_received: number; qty_defect: number; products: { name: string } | null }[] };
  const list = (rows ?? []) as Row[];
  return (
    <div className="space-y-6">
      <Header title="การผลิต" sub="BOM → ใบสั่งผลิต → เบิกผ้า/อุปกรณ์ให้โรงงาน (ตัดสต็อก) → รับสินค้าสำเร็จรูปเข้าคลัง → ค่าจ้าง/ต้นทุน"
        action={<div className="flex gap-2"><Link href="/production/bom" className="btn-outline"><Layers size={16} /> สูตร BOM</Link><Link href="/production/orders/new" className="btn-primary"><Plus size={16} /> เปิดใบสั่งผลิต</Link></div>} />
      {sum && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={`ใบสั่งผลิตที่เปิดอยู่${Number(sum.overdue) ? ` · เลยกำหนด ${sum.overdue}` : ""}`} value={`${sum.open} ใบ · ค้าง ${Number(sum.open_pieces).toLocaleString()} ชิ้น`} tone="yellow" href="/production?status=issued" />
          <Stat label="รับเข้าคลังเดือนนี้" value={`${Number(sum.month_received).toLocaleString()} ชิ้น`} tone="teal" />
          <Stat label="ของเสียจากการผลิตเดือนนี้" value={`${Number(sum.month_defect).toLocaleString()} ชิ้น`} tone="coral" />
          <Stat label={`สินค้าที่มี BOM${Number(sum.low_materials) ? ` · วัสดุใกล้หมด ${sum.low_materials}` : ""}`} value={`${sum.boms} รายการ`} tone="purple" href="/production/bom" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => <Link key={t.key} href={`/production?status=${t.key}${q ? `&q=${q}` : ""}`} className={`px-3 py-1.5 rounded-full text-sm ${status === t.key ? "bg-purple text-white" : "bg-white border border-line hover:bg-cream"}`}>{t.label}</Link>)}
        <form className="ml-auto"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="ค้นหาเลขที่ / โรงงาน…" className="input w-64" /></form>
      </div>
      <div className="card overflow-x-auto"><table className="tbl">
        <thead><tr><th>เลขที่</th><th>วันที่</th><th>กำหนดส่ง</th><th>โรงงาน</th><th>สินค้า</th><th className="text-right">สั่ง</th><th className="text-right">รับแล้ว</th><th className="text-right">เสีย</th>{session.isAdmin && <th className="text-right">ต้นทุนวัสดุ+ค่าจ้าง</th>}<th>สถานะ</th></tr></thead>
        <tbody>{list.map((r) => { const o = r.production_order_items.reduce((a, i) => a + i.qty_ordered, 0); const g = r.production_order_items.reduce((a, i) => a + i.qty_received, 0); const d = r.production_order_items.reduce((a, i) => a + i.qty_defect, 0); const late = r.due_date && r.due_date < new Date().toISOString().slice(0, 10) && !["completed", "cancelled"].includes(r.status); return (
          <tr key={r.id}><td><Link href={`/production/orders/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.doc_no}</Link></td><td className="whitespace-nowrap">{fmtDate(r.doc_date)}</td><td className={`whitespace-nowrap text-xs ${late ? "text-red font-semibold" : ""}`}>{r.due_date ? fmtDate(r.due_date) : "—"}</td>
            <td className="font-medium">{r.factory_name ?? "—"}</td><td className="text-xs max-w-[260px] truncate">{r.production_order_items.map((i) => i.products?.name).filter(Boolean).join(", ")}</td>
            <td className="text-right">{o}</td><td className="text-right text-green">{g}</td><td className="text-right text-red">{d || "—"}</td>
            {session.isAdmin && <td className="text-right">{(Number(r.material_cost) + Number(r.wage_total)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>}
            <td><span className={MO_STATUS_BADGE[r.status as MoStatus]}>{MO_STATUS_TH[r.status as MoStatus]}</span></td></tr>); })}
          {!list.length && <tr><td colSpan={10} className="text-center text-ink-soft py-10">ยังไม่มีใบสั่งผลิต — สร้าง BOM ให้สินค้าก่อน แล้วกด “เปิดใบสั่งผลิต”</td></tr>}</tbody></table></div>
    </div>
  );
}
