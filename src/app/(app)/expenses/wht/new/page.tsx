import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { WhtForm } from "@/components/expenses/WhtForm";
import { expenseEditorData } from "@/lib/expenses/queries";
import { createWhtCert } from "../../actions";
import type { Expense } from "@/lib/expenses/types";

export const dynamic = "force-dynamic";

export default async function NewWht({ searchParams }: { searchParams: Promise<{ error?: string; expense?: string }> }) {
  const { error, expense } = await searchParams;
  const supabase = await createClient();
  const { companies, suppliers } = await expenseEditorData(supabase);
  let defaults: Record<string, unknown> | undefined;
  if (expense) {
    const { data } = await supabase.from("expenses").select("*, expense_categories(wht_income_type)").eq("id", expense).maybeSingle();
    const e = data as (Expense & { expense_categories: { wht_income_type: string | null } | null }) | null;
    if (e) defaults = { expense_id: e.id, payee_name: e.supplier_name, payee_tax_id: e.supplier_tax_id ?? "", payee_address: e.supplier_address ?? "", payee_branch: e.supplier_branch ?? "", form: e.supplier_is_company ? "pnd53" : "pnd3", amount: Number(e.net_before_vat), pct: Number(e.wht_pct) || 3, income_type: e.expense_categories?.wht_income_type ?? "ค่าบริการ", pay_date: e.paid_date ?? e.bill_date };
  }
  return (
    <div className="space-y-6">
      <Header title="ออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)" sub="ออกใบเดี่ยวได้ทันที ไม่ต้องผ่านบิลค่าใช้จ่าย เช่น ค่าทำบัญชี ค่าบริการ ค่าเช่า" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createWhtCert} className="space-y-6">
        <WhtForm companies={companies} suppliers={suppliers} defaults={defaults as never} />
        <div className="flex gap-3"><button className="btn-primary">ออกหนังสือรับรอง</button><Link href="/expenses/wht" className="btn-ghost">ยกเลิก</Link></div>
      </form>
    </div>
  );
}
