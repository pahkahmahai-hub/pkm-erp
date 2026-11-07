import type { SupabaseClient } from "@supabase/supabase-js";

export async function editorData(supabase: SupabaseClient) {
  const [{ data: companies }, { data: products }, { data: customers }] = await Promise.all([
    supabase.from("companies").select("*").eq("is_active", true).order("code"),
    supabase.from("products").select("id, code, name, barcode, price, unit, stock_qty").eq("is_active", true).order("name"),
    supabase.from("contacts").select("id, name, code, tax_id, address, address2, address3, postcode, branch_code, credit_days, default_discount_pct, default_vat_mode, default_channel").eq("kind", "customer").eq("is_active", true).order("name"),
  ]);
  return { companies: companies ?? [], products: products ?? [], customers: customers ?? [] };
}
