import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import type { Product } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function BomList({ searchParams }: { searchParams: Promise<{ q?: string; only?: string }> }) {
  const { q = "", only } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  let pq = supabase.from("products").select("id, code, name, barcode, unit, cost, price, dept").eq("is_active", true).order("name").limit(400);
  if (q) pq = pq.or(`name.ilike.%${q}%,code.ilike.%${q}%,barcode.ilike.%${q}%`);
  const [{ data: products }, { data: boms }] = await Promise.all([pq, supabase.from("boms").select("product_id, wage_per_piece, updated_at, bom_items(count)").eq("is_active", true)]);
  type B = { product_id: string; wage_per_piece: number; updated_at: string; bom_items: { count: number }[] };
  const byProd = new Map(((boms ?? []) as B[]).map((b) => [b.product_id, b]));
  let rows = (products ?? []) as Pick<Product, "id" | "code" | "name" | "barcode" | "unit" | "cost" | "price" | "dept">[];
  if (only === "missing") rows = rows.filter((p) => !byProd.has(p.id));
  if (only === "done") rows = rows.filter((p) => byProd.has(p.id));
  return (
    <div className="space-y-6">
      <Header title="สูตรการผลิต (BOM)" sub={`${byProd.size} สินค้ามีสูตรแล้ว จาก ${(products ?? []).length} รายการ`} />
      <div className="flex flex-wrap items-center gap-2">
        {[["", "ทั้งหมด"], ["done", "มีสูตรแล้ว"], ["missing", "ยังไม่มีสูตร"]].map(([k, l]) => <Link key={k} href={`/production/bom?only=${k}${q ? `&q=${q}` : ""}`} className={`px-3 py-1.5 rounded-full text-sm ${(only ?? "") === k ? "bg-purple text-white" : "bg-white border border-line hover:bg-cream"}`}>{l}</Link>)}
        <form className="ml-auto"><input type="hidden" name="only" value={only ?? ""} /><input name="q" defaultValue={q} placeholder="ค้นหาสินค้า…" className="input w-64" /></form>
      </div>
      <div className="card overflow-x-auto"><table className="tbl">
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>หมวด</th><th className="text-right">วัสดุในสูตร</th><th className="text-right">ค่าจ้าง/ชิ้น</th>{session.isAdmin && <th className="text-right">ต้นทุนล่าสุด</th>}<th>อัปเดต</th><th /></tr></thead>
        <tbody>{rows.map((p) => { const b = byProd.get(p.id); return (
          <tr key={p.id} className={!b ? "opacity-70" : ""}><td className="font-mono text-xs">{p.code}</td><td className="font-medium">{p.name}</td><td className="text-xs text-ink-soft">{p.dept ?? "—"}</td>
            <td className="text-right">{b ? `${Number(b.bom_items?.[0]?.count ?? 0)} รายการ` : <span className="badge-off">ยังไม่มี</span>}</td><td className="text-right">{b ? Number(b.wage_per_piece).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—"}</td>
            {session.isAdmin && <td className="text-right">{p.cost != null ? Number(p.cost).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—"}</td>}
            <td className="text-xs text-ink-soft">{b ? new Date(b.updated_at).toLocaleDateString("th-TH") : "—"}</td>
            <td className="text-right"><Link href={`/production/bom/${p.id}`} className="btn-ghost !py-1 !px-2 text-xs">{b ? "แก้สูตร" : "+ สร้างสูตร"}</Link></td></tr>); })}
          {!rows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-10">ไม่พบสินค้า</td></tr>}</tbody></table></div>
    </div>
  );
}
