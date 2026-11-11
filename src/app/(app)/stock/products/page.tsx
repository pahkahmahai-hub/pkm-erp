import Link from "next/link";
import { QuickAdjust } from "@/components/stock/QuickAdjust";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import type { Product } from "@/lib/stock/types";
import { ExportProducts } from "./ExportProducts";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string; filter?: string; deleted?: string }> }) {
  const { q = "", dept = "", filter = "", deleted } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("products").select("*").order("sort_order", { nullsFirst: false }).order("code");
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%,barcode.ilike.%${q}%`);
  if (dept) query = query.eq("dept", dept);
  if (filter === "inactive") query = query.eq("is_active", false); else query = query.eq("is_active", true);
  const { data } = await query;
  let products = (data ?? []) as Product[];
  if (filter === "low") products = products.filter((p) => p.min_alert > 0 && p.stock_qty <= p.min_alert);
  if (filter === "zero") products = products.filter((p) => p.stock_qty === 0);
  const { data: depts } = await supabase.from("products").select("dept").not("dept", "is", null);
  const deptList = [...new Set((depts ?? []).map((d) => d.dept as string))].sort();

  return (
    <div className="space-y-6">
      <Header title="สินค้า" sub={`${products.length} รายการ · คงคลังรวม ${products.reduce((a, p) => a + p.stock_qty, 0).toLocaleString()} ชิ้น`} action={
        <div className="flex gap-2">
          <ExportProducts products={products} />
          <Link href="/stock/products/new" className="btn-primary"><Plus size={16} /> เพิ่มสินค้า</Link>
        </div>
      } />
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบสินค้าแล้ว</div>}

      <form className="flex flex-wrap gap-2 items-end">
        <input name="q" defaultValue={q} className="input w-64" placeholder="ค้นหา ชื่อ / รหัส / บาร์โค้ด" />
        <select name="dept" defaultValue={dept} className="input w-44">
          <option value="">ทุกหมวด</option>
          {deptList.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select name="filter" defaultValue={filter} className="input w-44">
          <option value="">ที่ใช้งาน</option>
          <option value="low">ใกล้หมด</option>
          <option value="zero">สต็อก 0</option>
          <option value="inactive">ปิดใช้งานแล้ว</option>
        </select>
        <button className="btn-outline">ค้นหา</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[820px]">
          <thead><tr><th></th><th>รหัส</th><th>สินค้า</th><th>บาร์โค้ด</th><th>หมวด</th><th className="text-right">ราคา</th><th className="text-right">คงเหลือ</th><th className="text-right">เสีย</th><th className="text-right">ขั้นต่ำ</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const low = p.min_alert > 0 && p.stock_qty <= p.min_alert;
              return (
                <tr key={p.id}>
                  <td className="w-10">{p.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-lavender/40" />}</td>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td><Link href={`/stock/products/${p.id}`} className="font-medium text-purple hover:underline">{p.name}</Link></td>
                  <td className="font-mono text-xs text-ink-soft">{p.barcode ?? "—"}</td>
                  <td className="text-xs">{p.dept}{p.sub_dept ? ` / ${p.sub_dept}` : ""}</td>
                  <td className="text-right">{Number(p.price).toLocaleString()}</td>
                  <td className="text-right"><QuickAdjust productId={p.id} qty={p.stock_qty} low={low} /></td>
                  <td className="text-right text-ink-soft">{p.defect_qty || "—"}</td>
                  <td className="text-right text-ink-soft">{p.min_alert || "—"}</td>
                </tr>
              );
            })}
            {!products.length && <tr><td colSpan={9} className="text-center text-ink-soft py-8">ไม่พบสินค้า</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
