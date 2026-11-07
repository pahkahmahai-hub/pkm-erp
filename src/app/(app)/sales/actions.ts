"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const s = nul(v); return s === null ? 0 : Number(s); };

export async function createSalesDoc(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const type = String(formData.get("doc_type"));
  const items = JSON.parse(String(formData.get("items") ?? "[]"));
  const { data, error } = await supabase.rpc("create_sales_doc", {
    p_company: formData.get("company_id"),
    p_type: type,
    p_customer: nul(formData.get("contact_id")),
    p_customer_name: String(formData.get("customer_name")).trim(),
    p_customer_address: nul(formData.get("customer_address")),
    p_customer_tax_id: nul(formData.get("customer_tax_id")),
    p_customer_branch: nul(formData.get("customer_branch")),
    p_doc_date: nul(formData.get("doc_date")),
    p_due_date: nul(formData.get("due_date")),
    p_valid_until: nul(formData.get("valid_until")),
    p_channel: nul(formData.get("channel")) ?? "corporate",
    p_ref_doc: nul(formData.get("ref_doc_id")),
    p_ref_doc_no: nul(formData.get("ref_doc_no")),
    p_po_no: nul(formData.get("po_no")),
    p_vat_mode: nul(formData.get("vat_mode")) ?? "inclusive",
    p_discount_pct: num(formData.get("discount_pct")),
    p_discount_amount: num(formData.get("discount_amount")),
    p_deposit_amount: num(formData.get("deposit_amount")),
    p_deposit_ref: nul(formData.get("deposit_ref")),
    p_wht_pct: num(formData.get("wht_pct")),
    p_notes: nul(formData.get("notes")),
    p_internal_note: nul(formData.get("internal_note")),
    p_seller_name: nul(formData.get("seller_name")),
    p_deduct_stock: formData.get("deduct_stock") === "on",
    p_items: items,
    p_doc_no: nul(formData.get("doc_no")),
    p_source: nul(formData.get("source")) ?? "system",
  });
  if (error) redirect(`/sales/docs/new?type=${type}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${data.id}?created=1`);
}

export async function updateSalesDoc(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const items = JSON.parse(String(formData.get("items") ?? "[]"));
  const { error } = await supabase.from("sales_docs").update({
    customer_id: nul(formData.get("contact_id")),
    customer_name: String(formData.get("customer_name")).trim(),
    customer_address: nul(formData.get("customer_address")),
    customer_tax_id: nul(formData.get("customer_tax_id")),
    customer_branch: nul(formData.get("customer_branch")),
    doc_date: nul(formData.get("doc_date")),
    due_date: nul(formData.get("due_date")),
    valid_until: nul(formData.get("valid_until")),
    channel: nul(formData.get("channel")) ?? "corporate",
    ref_doc_no: nul(formData.get("ref_doc_no")),
    po_no: nul(formData.get("po_no")),
    vat_mode: nul(formData.get("vat_mode")) ?? "inclusive",
    discount_pct: num(formData.get("discount_pct")),
    discount_amount: num(formData.get("discount_amount")),
    deposit_amount: num(formData.get("deposit_amount")),
    deposit_ref: nul(formData.get("deposit_ref")),
    wht_pct: num(formData.get("wht_pct")),
    notes: nul(formData.get("notes")),
    internal_note: nul(formData.get("internal_note")),
    seller_name: nul(formData.get("seller_name")),
    deduct_stock: formData.get("deduct_stock") === "on",
  }).eq("id", id).eq("status", "draft");
  if (error) redirect(`/sales/docs/${id}/edit?error=${encodeURIComponent(error.message)}`);
  const { error: e2 } = await supabase.rpc("replace_sales_items", { p_doc: id, p_items: items });
  if (e2) redirect(`/sales/docs/${id}/edit?error=${encodeURIComponent(e2.message)}`);
  revalidatePath(`/sales/docs/${id}`);
  redirect(`/sales/docs/${id}?saved=1`);
}

export async function issueSalesDoc(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_sales_doc", { p_doc: id });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${id}?issued=1`);
}

export async function convertSalesDoc(id: string, toType: string, formData?: FormData) {
  await getSession();
  const supabase = await createClient();
  const deduct = formData?.get("deduct_stock") === "on";
  const { data, error } = await supabase.rpc("convert_sales_doc", { p_from: id, p_to_type: toType, p_deduct_stock: deduct });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${data.id}/edit?from=${id}`);
}

export async function settleReceipt(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_receipt", { p_receipt: id, p_method: nul(formData.get("payment_method")) ?? "โอน", p_date: nul(formData.get("payment_date")), p_ref: nul(formData.get("payment_ref")) });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${id}?paid=1`);
}

export async function cancelSalesDoc(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sales_doc", { p_doc: id, p_reason: nul(formData.get("reason")) });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${id}`);
}

export async function deleteDraft(id: string, type: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("sales_docs").delete().eq("id", id).eq("status", "draft");
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent("ลบได้เฉพาะฉบับร่าง")}`);
  revalidatePath("/sales");
  redirect(`/sales/docs?type=${type}&deleted=1`);
}

// ---------- online daily ----------
export async function saveOnlineDay(formData: FormData) {
  const s = await getSession();
  const supabase = await createClient();
  const date = String(formData.get("sale_date"));
  const channels = formData.getAll("channel") as string[];
  const rows = channels.map((ch) => ({
    sale_date: date, channel: ch,
    orders_count: Math.round(num(formData.get(`orders_${ch}`))),
    gross_amount: num(formData.get(`gross_${ch}`)),
    fees: num(formData.get(`fees_${ch}`)),
    recorded_tks: formData.get(`tks_${ch}`) === "on",
    note: nul(formData.get(`note_${ch}`)),
    created_by: s.appUser.id,
  })).filter((r) => r.orders_count > 0 || r.gross_amount > 0 || r.fees > 0 || r.note);
  if (rows.length) {
    const { error } = await supabase.from("online_sales_daily").upsert(rows, { onConflict: "sale_date,channel" });
    if (error) redirect(`/sales/online?date=${date}&error=${encodeURIComponent(error.message)}`);
  }
  // remove rows zeroed out
  const zeroed = channels.filter((ch) => !rows.some((r) => r.channel === ch));
  if (zeroed.length) await supabase.from("online_sales_daily").delete().eq("sale_date", date).in("channel", zeroed);
  revalidatePath("/sales/online");
  redirect(`/sales/online?date=${date}&saved=1`);
}

export async function toggleChannelTks(key: string, value: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("online_channels").update({ bills_to_tks: value }).eq("key", key);
  revalidatePath("/sales/online");
}

// ---------- companies ----------
export async function saveCompany(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const fields = ["name_th", "name_en", "branch", "address_th", "address_en", "tax_id", "phone", "mobile", "email", "website", "bank_name", "bank_branch", "bank_account_name", "bank_account_no", "signer_name"];
  const row: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f, nul(formData.get(f))]));
  row.vat_registered = formData.get("vat_registered") === "on";
  row.doc_lang = nul(formData.get("doc_lang")) ?? "th";
  const { error } = await supabase.from("companies").update(row).eq("id", id);
  if (error) redirect(`/sales/companies?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales/companies");
  redirect("/sales/companies?saved=1");
}
