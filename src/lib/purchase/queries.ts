import type { SupabaseClient } from "@supabase/supabase-js";

export async function purchaseEditorData(supabase: SupabaseClient) {
  const [{ data: companies }, { data: suppliers }, { data: products }, { data: materials }, { data: categories }] = await Promise.all([
    supabase.from("companies").select("*").eq("is_active", true).order("code"),
    supabase.from("contacts").select("id, name, code, tax_id, address, address2, address3, postcode, branch_code, entity_type, default_expense_category, default_wht_pct, default_vat_mode_purchase").eq("kind", "supplier").eq("is_active", true).order("name"),
    supabase.from("products").select("id, code, name, barcode, unit").eq("is_active", true).order("name"),
    supabase.from("materials").select("id, code, name, unit, kind").eq("is_active", true).order("name"),
    supabase.from("expense_categories").select("*").eq("is_active", true).order("sort_order"),
  ]);
  return { companies: companies ?? [], suppliers: suppliers ?? [], products: products ?? [], materials: materials ?? [], categories: categories ?? [] };
}
