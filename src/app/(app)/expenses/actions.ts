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

/** ส่วนลดรายบรรทัด (0044) — ส่งต่อหลังสร้าง/แก้บิล */
async function applyLineDiscounts(supabase: Awaited<ReturnType<typeof createClient>>, id: string, formData: FormData): Promise<string | null> {
  const items = JSON.parse(String(formData.get("items") ?? "[]")) as { discount?: number }[];
  const d = items.map((i) => Number(i.discount) || 0);
  if (d.some((x) => x > 0)) {
    const { error } = await supabase.rpc("set_expense_item_discounts", { p_id: id, p_discounts: d });
    if (error) return `บันทึกส่วนลดรายบรรทัดไม่ได้: ${error.message}`;
  }
  // มัดจำ (0045) — ส่งเมื่อมีช่องนี้ในฟอร์ม
  if (formData.has("deposit_amount")) {
    const amt = Number(formData.get("deposit_amount")) || 0; const note = nul(formData.get("deposit_note"));
    if (amt > 0 || note || formData.get("deposit_had") === "1") {
      const { error } = await supabase.rpc("set_expense_deposit", { p_id: id, p_amount: amt, p_note: note });
      if (error) return `บันทึกมัดจำไม่ได้: ${error.message}`;
    }
  }
  // จ่ายมัดจำรอบแรก (0046) — แยกยอดคงเหลือไปบิลใหม่
  const split = Number(formData.get("split_deposit")) || 0;
  if (split > 0) {
    const { error } = await supabase.rpc("split_expense_deposit", { p_id: id, p_deposit: split, p_due: nul(formData.get("split_due")), p_round: nul(formData.get("split_round")) });
    if (error) return `แยกมัดจำไม่ได้: ${error.message}`;
    revalidatePath("/expenses/payables");
  }
  return null;
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
  const dErr = await applyLineDiscounts(supabase, data.id, formData);
  revalidatePath("/expenses");
  redirect(`/expenses/${data.id}?created=1${dErr ? `&error=${encodeURIComponent(dErr)}` : ""}`);
}

export async function updateExpense(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_expense", { p_id: id, ...commonArgs(formData) });
  if (error) redirect(`/expenses/${id}/edit?error=${encodeURIComponent(error.message)}`);
  const dErr = await applyLineDiscounts(supabase, id, formData);
  if (dErr) redirect(`/expenses/${id}/edit?error=${encodeURIComponent(dErr)}`);
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

// ---------------- บันทึกด่วน + จ่ายพร้อมสลิป (0041) ----------------
export interface QuickExpenseInput {
  company_id: string; supplier_id: string | null; supplier_name: string; category_id: string | null; description: string | null;
  amount: number; vat_mode: "inclusive" | "exclusive" | "none"; wht_pct: number; bill_no: string | null; bill_date: string;
  files: { path: string; kind: string }[]; pay_now: boolean; paid_date: string | null; paid_method: string; paid_ref: string | null;
}

/** บันทึกค่าใช้จ่ายจากมือถือ: ผู้บริหาร + "จ่ายแล้ว" → สร้าง → อนุมัติ → จ่าย ในครั้งเดียว · ไม่งั้นส่งรออนุมัติ */
export async function quickExpense(input: QuickExpenseInput): Promise<{ id?: string; error?: string }> {
  const session = await getSession();
  const supabase = await createClient();
  if (!input.supplier_name.trim()) return { error: "ใส่ชื่อร้าน/ซัพพลายเออร์" };
  if (!(input.amount > 0)) return { error: "ใส่ยอดเงิน" };
  let sup: { tax_id?: string | null; address?: string | null; branch_code?: string | null; entity_type?: string | null } | null = null;
  if (input.supplier_id) { const { data } = await supabase.from("contacts").select("tax_id, address, branch_code, entity_type").eq("id", input.supplier_id).maybeSingle(); sup = data; }
  const { data: e, error } = await supabase.rpc("create_expense", {
    p_company: input.company_id, p_supplier: input.supplier_id, p_supplier_name: input.supplier_name.trim(), p_supplier_tax_id: sup?.tax_id ?? null, p_supplier_address: sup?.address ?? null,
    p_supplier_branch: sup?.branch_code ?? null, p_supplier_is_company: sup ? sup.entity_type !== "บุคคลธรรมดา" : true, p_category: input.category_id, p_bill_no: input.bill_no, p_bill_date: input.bill_date,
    p_due_date: null, p_description: input.description, p_vat_mode: input.vat_mode, p_discount: 0, p_wht_pct: input.wht_pct || 0, p_pay_round: null, p_note: null,
    p_items: [{ description: input.description || "ค่าใช้จ่าย", qty: 1, unit_price: input.amount }], p_files: input.files, p_ai: null, p_submit: true,
  });
  if (error) return { error: error.message };
  if (session.isAdmin) {   // ผู้บริหารบันทึกเอง = อนุมัติในตัว → ไปอยู่ "เตรียมจ่าย" หรือจ่ายเลย
    const r1 = await supabase.rpc("review_expense", { p_id: e.id, p_decision: "approved", p_note: input.pay_now ? "บันทึกด่วน — จ่ายแล้ว" : "บันทึกด่วน", p_pay_round: null });
    if (r1.error) return { id: e.id, error: r1.error.message };
  }
  if (input.pay_now && session.isAdmin) {
    const r2 = await supabase.rpc("pay_expense", { p_id: e.id, p_paid_date: input.paid_date ?? input.bill_date, p_method: input.paid_method || "โอน", p_ref: input.paid_ref, p_issue_wht: true });
    if (r2.error) return { id: e.id, error: r2.error.message };
  }
  revalidatePath("/expenses");
  return { id: e.id };
}

/** จ่ายหลายใบพร้อมแนบสลิปเดียวกัน (หรือใบเดียว) */
export async function payWithSlip(ids: string[], slips: { path: string; kind: string }[], paidDate: string | null, method: string, ref: string | null): Promise<{ error?: string; paid?: number }> {
  await requireAdmin();
  const supabase = await createClient();
  let paid = 0;
  for (const id of ids) {
    if (slips.length) { const a = await supabase.rpc("add_expense_files", { p_id: id, p_files: slips }); if (a.error) return { error: a.error.message, paid }; }
    const { error } = await supabase.rpc("pay_expense", { p_id: id, p_paid_date: paidDate, p_method: method || "โอน", p_ref: ref, p_issue_wht: true });
    if (error) return { error: error.message, paid };
    paid++;
  }
  revalidatePath("/expenses"); revalidatePath("/expenses/payables");
  return { paid };
}

/** แนบไฟล์เพิ่ม (สลิป/บิล) ในรายการที่มีอยู่ */
export async function attachExpenseFiles(id: string, files: { path: string; kind: string }[]): Promise<{ error?: string }> {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_expense_files", { p_id: id, p_files: files });
  if (error) return { error: error.message };
  revalidatePath(`/expenses/${id}`);
  return {};
}

// ---------------- บันทึกเข้าสต็อก (0043) ----------------
export interface StockLineIn { item_id: string; target: "product" | "material"; product_id?: string | null; material_id?: string | null; kind?: string; new_name?: string; unit?: string; qty: number }
export async function expenseToStock(id: string, lines: StockLineIn[]): Promise<{ error?: string; materials?: number; products?: number }> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_to_stock", { p_expense: id, p_lines: lines });
  if (error) return { error: error.message };
  revalidatePath(`/expenses/${id}`); revalidatePath("/stock/materials");
  const r = data as { materials: number; products: number };
  return { materials: r.materials, products: r.products };
}

// ---------------- แยกจ่ายมัดจำ (0046) ----------------
export async function splitExpenseDeposit(id: string, deposit: number, due: string, round: string | null): Promise<{ error?: string; childId?: string }> {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("split_expense_deposit", { p_id: id, p_deposit: deposit, p_due: due, p_round: round });
  if (error) return { error: error.message };
  const { data: c } = await supabase.from("expenses").select("id").eq("parent_expense_id", id).maybeSingle();
  revalidatePath("/expenses"); revalidatePath(`/expenses/${id}`); revalidatePath("/expenses/payables");
  return { childId: c?.id as string | undefined };
}
