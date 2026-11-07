import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { expenseEditorData, aiEnabled } from "@/lib/expenses/queries";
import { createExpense } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewExpense({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const data = await expenseEditorData(supabase);
  return (
    <div className="space-y-6">
      <Header title="บันทึกบิลค่าใช้จ่าย" sub="ถ่ายรูปบิล → AI อ่านให้ → ตรวจ → ส่งขออนุมัติ" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createExpense} className="space-y-6">
        <ExpenseForm {...data} aiEnabled={aiEnabled()} />
        <div className="flex flex-wrap gap-3">
          <button name="submit_mode" value="pending" className="btn-primary">ส่งขออนุมัติ</button>
          <button name="submit_mode" value="draft" className="btn-outline">บันทึกร่างไว้ก่อน</button>
          <Link href="/expenses" className="btn-ghost">ยกเลิก</Link>
        </div>
      </form>
    </div>
  );
}
