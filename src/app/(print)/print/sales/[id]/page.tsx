import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SalesDoc, SalesDocItem } from "@/lib/sales/types";
import { DocSheet } from "@/components/sales/DocSheet";

export const dynamic = "force-dynamic";

export default async function PrintDoc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: doc }, { data: items }] = await Promise.all([
    supabase.from("sales_docs").select("*, companies(*)").eq("id", id).maybeSingle(),
    supabase.from("sales_doc_items").select("*").eq("doc_id", id).order("line_no"),
  ]);
  if (!doc) notFound();
  return <DocSheet d={doc as SalesDoc} lines={(items ?? []) as SalesDocItem[]} />;
}
