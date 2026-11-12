import type { SupabaseClient } from "@supabase/supabase-js";

export async function editorData(supabase: SupabaseClient) {
  const [{ data: companies }, { data: products }, { data: customers }, { data: consign }] = await Promise.all([
    supabase.from("companies").select("*").eq("is_active", true).order("code"),
    supabase.from("products").select("id, code, name, barcode, price, unit, stock_qty").eq("is_active", true).order("name"),
    supabase.from("contacts").select("id, name, code, tax_id, address, address2, address3, postcode, branch_code, credit_days, default_discount_pct, default_vat_mode, default_channel").eq("kind", "customer").eq("is_active", true).order("name"),
    supabase.from("consign_locations").select("id, name, contact_ids").eq("is_active", true).order("sort_order"),   // 0024 (ว่างถ้ายังไม่รัน)
  ]);
  return { companies: companies ?? [], products: products ?? [], customers: customers ?? [], consignLocations: (consign ?? []) as { id: string; name: string; contact_ids: string[] }[] };
}
