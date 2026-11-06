import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { EmployeeForm } from "../EmployeeForm";
import { createEmployee } from "../actions";
import type { Team } from "@/lib/types";

export default async function NewEmployeePage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: teams } = await supabase.from("teams").select("*").order("code");

  return (
    <div className="space-y-6">
      <Header title="เพิ่มพนักงานใหม่" />
      <form action={createEmployee} className="card p-6 space-y-6">
        <EmployeeForm teams={(teams ?? []) as Team[]} isAdmin />
        <div className="flex gap-3">
          <button className="btn-primary">บันทึก</button>
          <a href="/hr/employees" className="btn-ghost">ยกเลิก</a>
        </div>
      </form>
    </div>
  );
}
