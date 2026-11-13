import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { QuickExpense } from "@/components/expenses/QuickExpense";

export const dynamic = "force-dynamic";

export default async function QuickExpensePage({ searchParams }: { searchParams: Promise<{ shared?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: companies }, { data: suppliers }, { data: categories }] = await Promise.all([
    supabase.from("companies").select("id, code, name_th").eq("is_active", true).order("code"),
    supabase.from("contacts").select("id, name, default_expense_category, default_wht_pct, default_vat_mode_purchase").eq("kind", "supplier").eq("is_active", true).order("name"),
    supabase.from("expense_categories").select("id, name, wht_pct").eq("is_active", true).order("sort_order"),
  ]);
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Header crumbs={[{ href: "/expenses", label: "ค่าใช้จ่าย" }]} title="บันทึกด่วน" sub="ถ่ายรูปบิล + สลิป ใส่ยอด เสร็จในหน้าเดียว" />
      <QuickExpense companies={(companies ?? []) as never} suppliers={(suppliers ?? []) as never} categories={(categories ?? []) as never} isAdmin={session.isAdmin} shared={sp.shared === "1"} />
    </div>
  );
}
