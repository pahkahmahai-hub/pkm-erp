import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { EmployeeForm } from "../EmployeeForm";
import { updateEmployee, ensureLogin, setLoginActive } from "../actions";
import { fmtDateTime } from "@/lib/format";
import type { Employee, Team, AppUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EmployeeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const session = await getSession();
  if (!session.isAdmin && session.employee?.id !== id) notFound();

  const supabase = await createClient();
  const [{ data: emp }, { data: teams }, { data: login }] = await Promise.all([
    supabase.from("employees").select("*, teams(*)").eq("id", id).maybeSingle(),
    supabase.from("teams").select("*").order("code"),
    session.isAdmin ? supabase.from("app_users").select("*").eq("employee_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!emp) notFound();
  const e = emp as Employee;
  const user = login as AppUser | null;
  const action = updateEmployee.bind(null, id);

  return (
    <div className="space-y-6">
      <Header title={`${e.first_name} ${e.last_name}`} sub={`${e.emp_code} · ${e.teams?.name_th ?? ""}`} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {e.needs_review && (
        <div className="rounded-xl bg-yellow/15 text-[#8a6a00] text-sm px-4 py-3">
          <b>ต้องตรวจข้อมูล:</b> {e.review_note ?? "มีข้อมูลที่ยังไม่แน่ใจ"}
        </div>
      )}

      <form action={action} className="card p-6 space-y-6">
        <EmployeeForm employee={e} teams={(teams ?? []) as Team[]} isAdmin={session.isAdmin} />
        <div className="flex gap-3">
          <button className="btn-primary">บันทึก</button>
          <a href="/hr/employees" className="btn-ghost">กลับ</a>
        </div>
      </form>

      {session.isAdmin && (
        <section className="card p-6">
          <h2 className="font-display font-bold mb-3">บัญชีเข้าระบบ</h2>
          {user ? (
            <div className="text-sm space-y-1">
              <div>อีเมล: <b>{user.email}</b> · บทบาท: <span className="badge-off">{user.role === "admin" ? "ผู้ดูแล" : "พนักงาน"}</span>{" "}
                {user.is_active ? <span className="badge-ok">เปิดใช้งาน</span> : <span className="badge-rejected">ระงับ</span>}
              </div>
              <div className="text-ink-soft">เข้าระบบครั้งล่าสุด: {fmtDateTime(user.last_login_at)} {user.auth_user_id ? "" : "(ยังไม่เคยล็อกอิน)"}</div>
              <form action={setLoginActive.bind(null, id, !user.is_active)} className="pt-2">
                <button className={user.is_active ? "btn-danger py-1.5 text-xs" : "btn-outline py-1.5 text-xs"}>
                  {user.is_active ? "ระงับการเข้าระบบ" : "เปิดใช้งานอีกครั้ง"}
                </button>
              </form>
            </div>
          ) : (
            <form action={ensureLogin.bind(null, id)}>
              <p className="text-sm text-ink-soft mb-3">พนักงานคนนี้ยังไม่มีบัญชีเข้าระบบ</p>
              <button className="btn-outline" disabled={!e.email}>สร้างบัญชีจากอีเมล {e.email ?? "(ยังไม่มีอีเมล)"}</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
