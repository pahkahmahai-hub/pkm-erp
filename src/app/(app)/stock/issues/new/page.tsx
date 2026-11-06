import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { IssueForm } from "./IssueForm";

export const dynamic = "force-dynamic";

export default async function NewIssue({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: products }, { data: customers }] = await Promise.all([
    supabase.from("products").select("id, code, name, barcode, stock_qty, unit").eq("is_active", true).order("name"),
    supabase.from("contacts").select("id, name, code, tax_id").eq("kind", "customer").eq("is_active", true).order("name"),
  ]);
  return (
    <div className="space-y-6">
      <Header title="สร้างใบเบิกสินค้า" sub="เลือกรายการเอง หรืออัปโหลด PDF ใบส่งของ/ใบกำกับจาก FlowAccount" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <IssueForm products={products ?? []} customers={customers ?? []} />
    </div>
  );
}
