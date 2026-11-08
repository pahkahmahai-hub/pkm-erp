import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { PurchaseForm } from "@/components/purchase/PurchaseForm";
import { purchaseEditorData } from "@/lib/purchase/queries";
import { updatePurchaseDoc } from "../../../actions";
import type { PurchaseDoc, PurchaseItem } from "@/lib/purchase/types";

export const dynamic = "force-dynamic";
const TYPE = "po" as "pr" | "po";

export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: d }, { data: items }, data] = await Promise.all([
    supabase.from("purchase_docs").select("*").eq("id", id).maybeSingle(), supabase.from("purchase_items").select("*").eq("doc_id", id).order("line_no"), purchaseEditorData(supabase),
  ]);
  if (!d) notFound();
  return (
    <div className="space-y-6">
      <Header title={`แก้ไข ${d.doc_no}`} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={updatePurchaseDoc.bind(null, TYPE, id)} className="space-y-6">
        <PurchaseForm type={TYPE} {...data} doc={d as PurchaseDoc} items={(items ?? []) as PurchaseItem[]} />
        <div className="flex gap-3"><button className="btn-primary">บันทึก</button><Link href={`/purchase/orders/${id}`} className="btn-ghost">ยกเลิก</Link></div>
      </form>
    </div>
  );
}
