import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { ReceiptForm } from "./ReceiptForm";

export const dynamic = "force-dynamic";

export default async function NewReceipt({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: products }, { data: suppliers }] = await Promise.all([
    supabase.from("products").select("id, code, name, barcode, stock_qty, unit").eq("is_active", true).order("name"),
    supabase.from("contacts").select("id, name, code, tax_id").eq("kind", "supplier").eq("is_active", true).order("name"),
  ]);
  return (
    <div className="space-y-6">
      <Header title="บันทึกรับเข้าสินค้า" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <ReceiptForm products={products ?? []} suppliers={suppliers ?? []} />
    </div>
  );
}
