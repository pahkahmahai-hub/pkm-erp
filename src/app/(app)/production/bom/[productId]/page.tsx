import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { BomEditor } from "@/components/production/BomEditor";
import { saveBom } from "../../actions";
import type { Bom, BomItem } from "@/lib/production/types";

export const dynamic = "force-dynamic";

export default async function BomPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { productId } = await params; const { error, saved } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: product }, { data: bom }, { data: materials }] = await Promise.all([
    supabase.from("products").select("id, code, name, unit").eq("id", productId).maybeSingle(),
    supabase.from("boms").select("*").eq("product_id", productId).eq("is_active", true).maybeSingle(),
    supabase.from("materials").select("id, code, name, unit, kind, qty, unit_cost").eq("is_active", true).order("kind").order("name"),
  ]);
  if (!product) notFound();
  const { data: items } = bom ? await supabase.from("bom_items").select("*, materials(name, code, unit, kind, qty, unit_cost)").eq("bom_id", bom.id).order("sort_order") : { data: [] };
  const mats = (materials ?? []).map((m) => ({ ...m, unit_cost: session.isAdmin ? Number(m.unit_cost ?? 0) : 0 }));
  return (
    <div className="space-y-6">
      <Header title={`BOM · ${product.name}`} sub={`${product.code} · ${bom ? "แก้ไขสูตรปัจจุบัน" : "สร้างสูตรใหม่"}`} action={<Link href="/production/bom" className="btn-ghost">← รายการ BOM</Link>} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกสูตรแล้ว — ใบสั่งผลิตใหม่จะใช้สูตรนี้</div>}
      <form action={saveBom.bind(null, productId)} className="space-y-6">
        <BomEditor materials={mats} bom={bom as Bom | null} items={((items ?? []) as BomItem[]).map((i) => ({ ...i, materials: i.materials ? { ...i.materials, unit_cost: session.isAdmin ? i.materials.unit_cost : 0 } : null }))} showCost={session.isAdmin} productName={product.name} />
        <div className="flex gap-3"><button className="btn-primary">บันทึกสูตร</button><Link href="/production/bom" className="btn-ghost">ยกเลิก</Link></div>
      </form>
    </div>
  );
}
