import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { MoForm } from "@/components/production/MoForm";
import { moEditorData } from "@/lib/production/queries";
import { updateProductionOrder } from "../../../actions";
import type { ProductionOrder, ProductionOrderItem } from "@/lib/production/types";

export const dynamic = "force-dynamic";

export default async function EditMo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: o }, { data: items }, data] = await Promise.all([
    supabase.from("production_orders").select("*").eq("id", id).maybeSingle(), supabase.from("production_order_items").select("*, products(code, name, barcode, unit)").eq("order_id", id).order("line_no"), moEditorData(supabase)]);
  if (!o) notFound();
  return (
    <div className="space-y-6">
      <Header title={`แก้ไข ${o.doc_no}`} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={updateProductionOrder.bind(null, id)} className="space-y-6">
        <MoForm {...data} order={o as ProductionOrder} items={(items ?? []) as ProductionOrderItem[]} showCost={session.isAdmin} />
        <div className="flex gap-3"><button className="btn-primary">บันทึก</button><Link href={`/production/orders/${id}`} className="btn-ghost">ยกเลิก</Link></div>
      </form>
    </div>
  );
}
