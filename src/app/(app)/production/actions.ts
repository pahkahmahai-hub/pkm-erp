"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const s = nul(v); return s === null ? 0 : Number(s); };

export async function saveBom(productId: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { error } = await supabase.rpc("save_bom", { p_product: productId, p_name: nul(formData.get("name")) ?? "มาตรฐาน", p_wage: num(formData.get("wage_per_piece")), p_note: nul(formData.get("note")), p_items: JSON.parse(String(formData.get("items") ?? "[]")) });
  if (error) redirect(`/production/bom/${productId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); redirect(`/production/bom/${productId}?saved=1`);
}

function orderArgs(formData: FormData) {
  return { p_factory: nul(formData.get("factory_id")), p_factory_name: nul(formData.get("factory_name")), p_doc_date: nul(formData.get("doc_date")), p_due_date: nul(formData.get("due_date")), p_notes: nul(formData.get("notes")), p_internal_note: nul(formData.get("internal_note")), p_items: JSON.parse(String(formData.get("items") ?? "[]")) };
}
export async function createProductionOrder(formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_production_order", { p_company: formData.get("company_id"), ...orderArgs(formData) });
  if (error) redirect(`/production/orders/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); redirect(`/production/orders/${data.id}?created=1`);
}
export async function updateProductionOrder(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { error } = await supabase.rpc("update_production_order", { p_id: id, ...orderArgs(formData) });
  if (error) redirect(`/production/orders/${id}/edit?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); redirect(`/production/orders/${id}?saved=1`);
}
export async function issueMaterials(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const ids = formData.getAll("material_id").map(String); const qtys = formData.getAll("issue_qty").map(Number);
  const lines = ids.map((m, i) => ({ material_id: m, qty: qtys[i] ?? 0 })).filter((l) => l.qty > 0);
  if (!lines.length) redirect(`/production/orders/${id}?error=${encodeURIComponent("ใส่จำนวนวัสดุที่เบิกอย่างน้อย 1 รายการ")}`);
  const { data, error } = await supabase.rpc("issue_production_materials", { p_order: id, p_lines: lines, p_issued_at: nul(formData.get("issued_at")), p_note: nul(formData.get("note")) });
  if (error) redirect(`/production/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); revalidatePath("/stock");
  redirect(`/production/orders/${id}?issued=${encodeURIComponent(data?.issue_no ?? "ok")}`);
}
export async function receiveProduction(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const ids = formData.getAll("item_id").map(String); const good = formData.getAll("qty_good").map(Number); const def = formData.getAll("qty_defect").map(Number);
  const lines = ids.map((it, i) => ({ item_id: it, qty_good: good[i] ?? 0, qty_defect: def[i] ?? 0 })).filter((l) => l.qty_good + l.qty_defect > 0);
  if (!lines.length) redirect(`/production/orders/${id}?error=${encodeURIComponent("ใส่จำนวนที่รับอย่างน้อย 1 รายการ")}`);
  const { data, error } = await supabase.rpc("receive_production", { p_order: id, p_lines: lines, p_received_at: nul(formData.get("received_at")), p_note: nul(formData.get("note")) });
  if (error) redirect(`/production/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); revalidatePath("/stock");
  redirect(`/production/orders/${id}?received=${encodeURIComponent(data?.receipt_no ?? "ok")}`);
}
export async function expenseFromProduction(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_from_production", { p_order: id, p_bill_no: nul(formData.get("bill_no")), p_bill_date: nul(formData.get("bill_date")), p_wht_pct: num(formData.get("wht_pct")) });
  if (error) redirect(`/production/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); revalidatePath("/expenses"); redirect(`/expenses/${data.id}?created=1`);
}
export async function cancelProductionOrder(id: string, formData: FormData) {
  await getSession(); const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_production_order", { p_id: id, p_reason: nul(formData.get("reason")) });
  if (error) redirect(`/production/orders/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/production"); redirect(`/production/orders/${id}?cancelled=1`);
}
