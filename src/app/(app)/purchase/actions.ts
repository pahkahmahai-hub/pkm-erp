"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const s = nul(v); return s === null ? 0 : Number(s); };
const base = (t: string) => (t === "po" ? "/purchase/orders" : "/purchase/requests");

function common(formData: FormData) {
  return {
    p_supplier: nul(formData.get("supplier_id")), p_supplier_name: nul(formData.get("supplier_name")), p_supplier_tax_id: nul(formData.get("supplier_tax_id")),
    p_supplier_address: nul(formData.get("supplier_address")), p_supplier_branch: nul(formData.get("supplier_branch")),
    p_doc_date: nul(formData.get("doc_date")), p_need_by: nul(formData.get("need_by")), p_purpose: nul(formData.get("purpose")), p_notes: nul(formData.get("notes")), p_internal_note: nul(formData.get("internal_note")),
    p_vat_mode: nul(formData.get("vat_mode")) ?? "exclusive", p_discount_pct: num(formData.get("discount_pct")), p_discount_amount: num(formData.get("discount_amount")),
    p_buyer_name: nul(formData.get("buyer_name")), p_items: JSON.parse(String(formData.get("items") ?? "[]")),
  };
}

export async function createPurchaseDoc(type: "pr" | "po", formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase_doc", { p_company: formData.get("company_id"), p_type: type, ...common(formData), p_submit: formData.get("submit_mode") !== "draft" });
  if (error) redirect(`${base(type)}/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase");
  redirect(`${base(type)}/${data.id}?created=1`);
}

export async function updatePurchaseDoc(type: "pr" | "po", id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_purchase_doc", { p_id: id, ...common(formData) });
  if (error) redirect(`${base(type)}/${id}/edit?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase");
  redirect(`${base(type)}/${id}?saved=1`);
}

export async function submitPurchaseRequest(id: string) {
  await getSession(); const supabase = await createClient();
  const { error } = await supabase.rpc("submit_purchase_request", { p_id: id });
  if (error) redirect(`/purchase/requests/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); redirect(`/purchase/requests/${id}?submitted=1`);
}

export async function reviewPurchaseRequest(id: string, decision: "approved" | "rejected", formData: FormData) {
  await requireAdmin(); const supabase = await createClient();
  const { error } = await supabase.rpc("review_purchase_request", { p_id: id, p_decision: decision, p_note: nul(formData.get("note")) });
  if (error) redirect(`/purchase/requests/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); redirect(`/purchase/requests/${id}?reviewed=1`);
}

export async function convertPrToPo(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_pr_to_po", { p_pr: id, p_doc_date: nul(formData.get("doc_date")) });
  if (error) redirect(`/purchase/requests/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); redirect(`/purchase/orders/${data.id}?created=1`);
}

export async function issuePo(id: string) {
  await getSession(); const supabase = await createClient();
  const { error } = await supabase.rpc("issue_po", { p_id: id });
  if (error) redirect(`/purchase/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); redirect(`/purchase/orders/${id}?issued=1`);
}

export async function receivePo(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const lines = formData.getAll("item_id").map((item, i) => ({ item_id: String(item), qty: Number(formData.getAll("recv_qty")[i] ?? 0), condition: String(formData.getAll("condition")[i] ?? "good") })).filter((l) => l.qty > 0);
  if (!lines.length) redirect(`/purchase/orders/${id}?error=${encodeURIComponent("ใส่จำนวนที่รับอย่างน้อย 1 รายการ")}`);
  const { data, error } = await supabase.rpc("receive_po", { p_id: id, p_lines: lines, p_received_at: nul(formData.get("received_at")), p_supplier_doc_no: nul(formData.get("supplier_doc_no")), p_note: nul(formData.get("note")) });
  if (error) redirect(`/purchase/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); revalidatePath("/stock");
  redirect(`/purchase/orders/${id}?received=${encodeURIComponent(data?.receipt_no ?? "ok")}`);
}

export async function expenseFromPo(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_from_po", { p_id: id, p_bill_no: nul(formData.get("bill_no")), p_bill_date: nul(formData.get("bill_date")), p_category: nul(formData.get("category_id")), p_wht_pct: num(formData.get("wht_pct")) });
  if (error) redirect(`/purchase/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); revalidatePath("/expenses");
  redirect(`/expenses/${data.id}?created=1`);
}

export async function cancelPurchaseDoc(type: "pr" | "po", id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_purchase_doc", { p_id: id, p_reason: nul(formData.get("reason")) });
  if (error) redirect(`${base(type)}/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/purchase"); redirect(`${base(type)}/${id}?cancelled=1`);
}

// ---------- ไฟล์แนบ PR/PO (0033) ----------
export interface PurchaseFileIn { path: string; name: string; mime: string | null; size: number; kind: "quote" | "image" | "other" }
export async function addPurchaseFiles(docId: string, files: PurchaseFileIn[], note: string | null): Promise<{ error?: string }> {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_doc_files").insert(files.map((f) => ({ doc_id: docId, path: f.path, file_name: f.name, mime: f.mime, size_bytes: f.size, kind: f.kind, note })));
  if (error) return { error: error.message };
  revalidatePath(`/purchase/orders/${docId}`); revalidatePath(`/purchase/requests/${docId}`);
  return {};
}
export async function deletePurchaseFile(id: string, docId: string): Promise<{ error?: string }> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_doc_files").delete().eq("id", id).select("path");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "ลบไม่ได้ — เฉพาะคนที่แนบหรือผู้บริหาร" };
  await supabase.storage.from("purchase-files").remove(data.map((d) => d.path as string));
  revalidatePath(`/purchase/orders/${docId}`); revalidatePath(`/purchase/requests/${docId}`);
  return {};
}
