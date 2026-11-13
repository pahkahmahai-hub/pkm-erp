"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const s = nul(v); return s === null ? 0 : Number(s); };

function commonArgs(formData: FormData) {
  return {
    p_supplier: nul(formData.get("supplier_id")),
    p_supplier_name: String(formData.get("supplier_name") ?? "").trim(),
    p_supplier_tax_id: nul(formData.get("supplier_tax_id")),
    p_supplier_address: nul(formData.get("supplier_address")),
    p_supplier_branch: nul(formData.get("supplier_branch")),
    p_supplier_is_company: formData.get("supplier_type") === "company",
    p_category: nul(formData.get("category_id")),
    p_bill_no: nul(formData.get("bill_no")),
    p_bill_date: nul(formData.get("bill_date")),
    p_due_date: nul(formData.get("due_date")),
    p_description: nul(formData.get("description")),
    p_vat_mode: nul(formData.get("vat_mode")) ?? "none",
    p_discount: num(formData.get("discount_amount")),
    p_wht_pct: num(formData.get("wht_pct")),
    p_pay_round: nul(formData.get("pay_round")),
    p_note: nul(formData.get("note")),
    p_items: JSON.parse(String(formData.get("items") ?? "[]")),
  };
}

export async function createExpense(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_expense", {
    p_company: formData.get("company_id"),
    ...commonArgs(formData),
    p_files: JSON.parse(String(formData.get("files") ?? "[]")),
    p_ai: formData.get("ai_json") ? JSON.parse(String(formData.get("ai_json"))) : null,
    p_submit: formData.get("submit_mode") !== "draft",
  });
  if (error) redirect(`/expenses/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses");
  redirect(`/expenses/${data.id}?created=1`);
}

export async function updateExpense(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_expense", { p_id: id, ...commonArgs(formData) });
  if (error) redirect(`/expenses/${id}/edit?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/expenses/${id}`);
  redirect(`/expenses/${id}?saved=1`);
}

export async function reviewExpense(id: string, decision: "approved" | "rejected", formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_expense", { p_id: id, p_decision: decision, p_note: nul(formData.get("note")), p_pay_round: nul(formData.get("pay_round")) });
  if (error) redirect(`/expenses/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses");
  redirect(`/expenses/${id}?reviewed=1`);
}

export async function payExpense(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_expense", { p_id: id, p_paid_date: nul(formData.get("paid_date")), p_method: nul(formData.get("paid_method")), p_ref: nul(formData.get("paid_ref")), p_issue_wht: formData.get("issue_wht") !== "off" });
  if (error) redirect(`/expenses/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses");
  const back = nul(formData.get("back"));
  redirect(back ?? `/expenses/${id}?paid=1`);
}

export async function cancelExpense(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_expense", { p_id: id, p_reason: nul(formData.get("reason")) });
  if (error) redirect(`/expenses/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses");
  redirect(`/expenses/${id}?cancelled=1`);
}

/** ลบค่าใช้จ่ายถาวร (0040) */
export async function deleteExpense(id: string) {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_expense", { p_id: id });
  if (error) redirect(`/expenses/${id}?error=${encodeURIComponent(error.message)}`);
  const paths = ((data ?? []) as unknown[]).map((x) => (typeof x === "string" ? x : (x as { delete_expense?: string }).delete_expense)).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from("expense-files").remove(paths);
  revalidatePath("/expenses");
  redirect("/expenses?deleted=1");
}

export async function saveCategory(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = nul(formData.get("id"));
  const row = { code: String(formData.get("code")).trim(), name: String(formData.get("name")).trim(), wht_pct: num(formData.get("wht_pct")), wht_income_type: nul(formData.get("wht_income_type")), sort_order: num(formData.get("sort_order")) || 100, is_active: formData.get("is_active") !== "off" };
  const { error } = id ? await supabase.from("expense_categories").update(row).eq("id", id) : await supabase.from("expense_categories").insert(row);
  if (error) redirect(`/expenses/categories?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses/categories");
  redirect("/expenses/categories?saved=1");
}

/** Signed URLs for private bill images (1 hour). */
export async function signExpenseFiles(paths: string[]) {
  await getSession();
  const supabase = await createClient();
  if (!paths.length) return [];
  const { data } = await supabase.storage.from("expense-files").createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl ?? "");
}

// ---------- withholding tax certificates (standalone) ----------
export async function createWhtCert(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const amount = num(formData.get("income_amount")); const pct = num(formData.get("wht_pct"));
  const { data, error } = await supabase.rpc("create_wht_cert", {
    p_company: formData.get("company_id"), p_form: formData.get("form"),
    p_payee_name: String(formData.get("payee_name") ?? "").trim(), p_payee_tax_id: nul(formData.get("payee_tax_id")), p_payee_address: nul(formData.get("payee_address")), p_payee_branch: nul(formData.get("payee_branch")),
    p_pay_date: nul(formData.get("pay_date")), p_income_row: Math.round(num(formData.get("income_row"))) || 5, p_income_type: nul(formData.get("income_type")),
    p_income_amount: amount, p_wht_pct: pct, p_wht_amount: nul(formData.get("wht_amount")) ? num(formData.get("wht_amount")) : null,
    p_payer_condition: Math.round(num(formData.get("payer_condition"))) || 1, p_note: nul(formData.get("note")), p_expense: nul(formData.get("expense_id")),
  });
  if (error) redirect(`/expenses/wht/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses/wht");
  redirect(`/expenses/wht?created=${data.id}`);
}

export async function deleteWhtCert(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_wht_cert", { p_id: id });
  if (error) redirect(`/expenses/wht?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/expenses/wht");
  redirect("/expenses/wht");
}
