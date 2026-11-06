import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { fmtDate, fmtTime, currentYm, monthRange, fullName } from "@/lib/format";
import type { Attendance, Employee } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ ym?: string; emp?: string }> }) {
  const { ym = currentYm(), emp } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const { from, to } = monthRange(ym);

  let q = supabase
    .from("attendance")
    .select("*, employees(emp_code, first_name, last_name, nickname)")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false })
    .order("check_in_at");

  if (!session.isAdmin) q = q.eq("employee_id", session.employee?.id ?? "");
  else if (emp) q = q.eq("employee_id", emp);

  const [{ data }, { data: emps }] = await Promise.all([
    q,
    session.isAdmin ? supabase.from("employees").select("id, first_name, last_name, nickname, emp_code").neq("status", "resigned").order("emp_code") : Promise.resolve({ data: [] }),
  ]);
  const rows = (data ?? []) as Attendance[];
  const late = rows.filter((r) => r.is_late).length;
  const outside = rows.filter((r) => r.check_in_in_range === false || r.check_out_in_range === false).length;

  return (
    <div className="space-y-6">
      <Header title="บันทึกเวลา" sub={`${rows.length} วัน · สาย ${late} · นอกพื้นที่ ${outside}`} />
      <form className="flex flex-wrap gap-3 items-end">
        <MonthPicker value={ym} />
        {session.isAdmin && (
          <div>
            <label className="label">พนักงาน</label>
            <select name="emp" defaultValue={emp ?? ""} className="input w-56">
              <option value="">ทุกคน</option>
              {(emps as Pick<Employee, "id" | "first_name" | "last_name" | "nickname" | "emp_code">[]).map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.nickname ? `(${e.nickname})` : ""}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn-outline">แสดง</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[640px]">
          <thead>
            <tr>
              <th>วันที่</th>
              {session.isAdmin && <th>พนักงาน</th>}
              <th>เข้า</th><th>ออก</th><th>สถานะ</th><th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.work_date, { weekday: "short" })}</td>
                {session.isAdmin && <td>{fullName(r.employees)}</td>}
                <td>{fmtTime(r.check_in_at)} {r.check_in_in_range === false && <span className="badge-rejected ml-1">นอก</span>}</td>
                <td>{fmtTime(r.check_out_at)} {r.check_out_in_range === false && <span className="badge-rejected ml-1">นอก</span>}</td>
                <td>{r.is_late ? <span className="badge-late">สาย {r.late_minutes} น.</span> : <span className="badge-ok">ตรงเวลา</span>}</td>
                <td className="text-xs text-ink-soft">{r.note}{r.admin_note && <span className="block text-purple">admin: {r.admin_note}</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-center text-ink-soft py-8">ไม่มีข้อมูลในเดือนนี้</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
