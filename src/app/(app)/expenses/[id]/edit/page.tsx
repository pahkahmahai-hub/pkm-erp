import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";
import { expenseEditorData, aiEnabled } from "@/lib/expenses/queries";
import { updateExpense, signExpenseFiles } from "../../actions";
import type { Expense, ExpenseItem, ExpenseFile } from "@/lib/expenses/types";

export const dynamic = "force-dynamic";

export default async function EditExpense({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: e }, { data: items }, { data: files }, data] = await Promise.all([
    supabase.from("expenses").select("*").eq("id", id).maybeSingle(),
    supabase.from("expense_items").select("*").eq("expense_id", id).order("line_no"),
    supabase.from("expense_files").select("*").eq("expense_id", id),
    expenseEditorData(supabase),
  ]);
  if (!e) notFound();
  const fl = (files ?? []) as ExpenseFile[];
  const urls = await signExpenseFiles(fl.map((f) => f.path));
  const action = updateExpense.bind(null, id);
  return (
    <div className="space-y-6">
      <Header title={`แก้ไข ${e.exp_no}`} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      {["approved", "paid"].includes(e.status as string) && <div className="rounded-xl bg-yellow/15 text-[#6b4f00] text-sm px-4 py-3">รายการนี้{e.status === "paid" ? "จ่ายเงินแล้ว" : "อนุมัติแล้ว"} — แก้ไขได้เฉพาะผู้บริหาร สถานะเดิมคงอยู่ · ถ้าแก้ยอด หนังสือรับรองหัก ณ ที่จ่ายที่ออกไปแล้วจะไม่เปลี่ยนตาม</div>}
      <form action={action} className="space-y-6">
        <ExpenseForm {...data} expense={e as Expense} items={(items ?? []) as ExpenseItem[]} existingFiles={fl.map((f, i) => ({ path: f.path, url: urls[i] ?? "", name: f.path }))} aiEnabled={aiEnabled()} />
        <div className="flex gap-3"><button className="btn-primary">บันทึก</button><a href={`/expenses/${id}`} className="btn-ghost">ยกเลิก</a></div>
      </form>
    </div>
  );
}
