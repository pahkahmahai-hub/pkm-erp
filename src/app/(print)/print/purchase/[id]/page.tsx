import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { DocSheet } from "@/components/sales/DocSheet";
import { toSheet, type PurchaseDoc, type PurchaseItem } from "@/lib/purchase/types";

export const dynamic = "force-dynamic";

export default async function PrintPurchase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSession();
  const supabase = await createClient();
  const [{ data: d }, { data: items }] = await Promise.all([
    supabase.from("purchase_docs").select("*, companies(*)").eq("id", id).maybeSingle(),
    supabase.from("purchase_items").select("*").eq("doc_id", id).order("line_no"),
  ]);
  if (!d) notFound();
  const { doc, lines } = toSheet(d as PurchaseDoc, (items ?? []) as PurchaseItem[]);
  return <DocSheet d={doc} lines={lines} />;
}
