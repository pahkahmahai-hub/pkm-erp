import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { PurchaseDetail } from "@/components/purchase/PurchaseDetail";
import type { PurchaseItem, PurchaseReceipt } from "@/lib/purchase/types";
import type { ExpenseCategory } from "@/lib/expenses/types";

export const dynamic = "force-dynamic";

export default async function DetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params; const flash = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: d }, { data: items }, { data: receipts }, { data: children }, { data: categories }] = await Promise.all([
    supabase.from("purchase_docs").select("*, companies(code, name_th), creator:app_users!purchase_docs_created_by_fkey(email), approver:app_users!purchase_docs_approved_by_fkey(email), expenses(exp_no, status)").eq("id", id).maybeSingle(),
    supabase.from("purchase_items").select("*").eq("doc_id", id).order("line_no"),
    supabase.from("purchase_receipts").select("*").eq("doc_id", id).order("received_at", { ascending: false }),
    supabase.from("purchase_docs").select("id, doc_no, status").eq("ref_doc_id", id).order("created_at"),
    supabase.from("expense_categories").select("*").eq("is_active", true).order("sort_order"),
  ]);
  if (!d) notFound();
  if (d.doc_type !== "po") redirect(`/purchase/${d.doc_type === "po" ? "orders" : "requests"}/${id}`);
  return <PurchaseDetail d={d as never} items={(items ?? []) as PurchaseItem[]} receipts={(receipts ?? []) as PurchaseReceipt[]} derived={children ?? []} session={session} categories={(categories ?? []) as ExpenseCategory[]} flash={flash} />;
}
