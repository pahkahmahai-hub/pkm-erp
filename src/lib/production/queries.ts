import type { SupabaseClient } from "@supabase/supabase-js";

export async function moEditorData(supabase: SupabaseClient) {
  const [{ data: companies }, { data: factories }, { data: products }, { data: boms }] = await Promise.all([
    supabase.from("companies").select("*").eq("is_active", true).order("code"),
    supabase.from("contacts").select("id, name, code, phone").eq("kind", "supplier").eq("is_active", true).order("name"),
    supabase.from("products").select("id, code, name, barcode, unit, stock_qty").eq("is_active", true).order("name"),
    supabase.from("boms").select("product_id, wage_per_piece").eq("is_active", true),
  ]);
  const bomMap = new Map((boms ?? []).map((b) => [b.product_id as string, Number(b.wage_per_piece)]));
  return { companies: companies ?? [], factories: factories ?? [], products: (products ?? []).map((p) => ({ ...p, has_bom: bomMap.has(p.id), wage: bomMap.get(p.id) ?? 0 })) };
}
