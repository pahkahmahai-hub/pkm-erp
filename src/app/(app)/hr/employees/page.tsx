import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, STATUS_TH } from "@/lib/format";
import type { Employee } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();

  if (!session.isAdmin) {
    const { data } = await supabase.from("employee_directory").select("*").order("emp_code");
    return (
      <div className="space-y-6">
        <Header title="เพื่อนร่วมงาน" sub="รายชื่อพนักงานปากาม้า" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((e) => (
            <div key={e.id} className="card p-4 flex gap-3">
              <div className="h-11 w-11 rounded-full bg-lavender/60 text-purple font-bold grid place-items-center shrink-0">{e.first_name[0]}</div>
              <div className="min-w-0">
                <div className="font-semibold">{e.first_name} {e.last_name}{e.nickname ? ` (${e.nickname})` : ""}</div>
                <div className="text-xs text-ink-soft">{e.emp_code} · {e.team_abbrev}</div>
                <div className="text-sm mt-1">{e.position ?? "—"}</div>
                <div className="text-xs text-ink-soft truncate">{e.email}</div>
                {e.id === session.employee?.id && <Link href={`/hr/employees/${e.id}`} className="text-xs text-purple font-semibold mt-1 inline-block">แก้ไขข้อมูลของฉัน</Link>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { data } = await supabase.from("employees").select("*, teams(*)").order("emp_code");
  const employees = (data ?? []) as Employee[];

  return (
    <div className="space-y-6">
      <Header
        title="ทะเบียนพนักงาน"
        sub={`${employees.filter((e) => e.status !== "resigned").length} คน`}
        action={<Link href="/hr/employees/new" className="btn-primary"><Plus size={16} /> เพิ่มพนักงาน</Link>}
      />
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบพนักงานแล้ว</div>}
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead>
            <tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ทีม</th><th>ตำแหน่ง</th><th>อีเมล</th><th>เริ่มงาน</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className={e.status === "resigned" ? "text-ink-soft" : ""}>
                <td className="font-mono text-xs">{e.emp_code}</td>
                <td>
                  <Link href={`/hr/employees/${e.id}`} className="font-medium text-purple hover:underline">
                    {e.title ?? ""}{e.first_name} {e.last_name}
                  </Link>
                  {e.nickname && <span className="text-ink-soft"> ({e.nickname})</span>}
                  {e.needs_review && <AlertTriangle size={14} className="inline ml-1 text-[#8a6a00]" />}
                </td>
                <td><span className="badge-off">{e.teams?.abbrev ?? "—"}</span></td>
                <td>{e.position ?? "—"}</td>
                <td className="text-xs">{e.email ?? "—"}</td>
                <td>{fmtDate(e.start_date)}</td>
                <td><span className={e.status === "active" ? "badge-ok" : e.status === "probation" ? "badge-pending" : "badge-off"}>{STATUS_TH[e.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
