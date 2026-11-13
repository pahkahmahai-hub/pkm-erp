import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { ExpenseToStock } from "@/components/expenses/ExpenseToStock";

export const dynamic = "force-dynamic";

export default async function ExpenseStockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSession();
  const supabase = await createClient();
  const [{ data: e }, { data: items }, { data: mats }, { data: prods }] = await Promise.all([
    supabase.from("expenses").select("id, exp_no, supplier_name, category_id, expense_categories(code)").eq("id", id).maybeSingle(),
    supabase.from("expense_items").select("*").eq("expense_id", id).order("line_no"),
    supabase.from("materials").select("id, kind, name, code, unit, qty").eq("is_active", true).order("name"),
    supabase.from("products").select("id, code, name").eq("is_active", true).order("name"),
  ]);
  if (!e) notFound();
  const catCode = (e.expense_categories as unknown as { code: string } | null)?.code;
  const def = catCode === "booth" ? "display" : catCode === "packaging" ? "packaging" : catCode === "material" ? "fabric" : "accessory";
  return (
    <div className="space-y-4">
      <Header crumbs={[{ href: "/expenses", label: "ค่าใช้จ่าย" }, { href: `/expenses/${id}`, label: e.exp_no as string }]} title="บันทึกเข้าสต็อก" sub={`${e.supplier_name} — เลือกแต่ละรายการว่าเข้าคลังไหน แล้วกดบันทึก`} />
      <ExpenseToStock expenseId={id} expNo={e.exp_no as string} items={(items ?? []) as never} materials={(mats ?? []) as never} products={(prods ?? []) as never} defaultTarget={def as never} />
    </div>
  );
}
