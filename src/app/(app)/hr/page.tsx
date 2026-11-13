import Link from "next/link";
import { MapPin, CalendarDays, BadgeCheck, Users, AlertTriangle, Lock, Wallet } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fmtTime, todayBkk, fmtDate, fullName, STATUS_TH, statusBadgeClass } from "@/lib/format";
import type { Attendance, LeaveRequest, OtRequest, Employee } from "@/lib/types";
import { Header, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await getSession();
  const supabase = await createClient();
  const today = todayBkk();

  if (session.isAdmin) {
    const [{ data: att }, { data: leaves }, { data: ots }, { data: emps }, { count: timeReqCount }] = await Promise.all([
      supabase.from("attendance").select("*, employees(emp_code, first_name, last_name, nickname)").eq("work_date", today).order("check_in_at"),
      supabase.from("leave_requests").select("*, employees(emp_code, first_name, last_name, nickname), leave_types(name_th)").eq("status", "pending").order("created_at"),
      supabase.from("ot_requests").select("*, employees(emp_code, first_name, last_name, nickname)").eq("status", "pending").order("created_at"),
      supabase.from("employees").select("*").neq("status", "resigned").order("emp_code"),
      supabase.from("attendance_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const attendance = (att ?? []) as Attendance[];
    const employees = (emps ?? []) as Employee[];
    const checkedIn = new Set(attendance.map((a) => a.employee_id));
    const notIn = employees.filter((e) => !checkedIn.has(e.id));
    const needsReview = employees.filter((e) => e.needs_review);

    return (
      <div className="space-y-6">
        <Header title="แดชบอร์ด HR" sub={fmtDate(today, { weekday: "long" })} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="เช็คอินวันนี้" value={`${attendance.length}/${employees.length}`} tone="teal" />
          <Stat label="มาสาย" value={attendance.filter((a) => a.is_late).length} tone="coral" />
          <Stat label="ใบลารออนุมัติ" value={leaves?.length ?? 0} tone="yellow" href="/hr/leave" />
          <Stat label="OT รออนุมัติ" value={ots?.length ?? 0} tone="purple" href="/hr/ot" />
        </div>
        <Link href="/hr/payroll" className="card p-4 flex items-center justify-between hover:border-purple">
          <span className="flex items-center gap-2 font-semibold"><Wallet size={18} className="text-purple" /> PAYROLL — เงินเดือน · OT · ประกันสังคม · สลิป</span>
          <span className="flex items-center gap-1 text-xs text-ink-soft"><Lock size={13} /> ต้องใส่รหัสผ่าน</span>
        </Link>
        {(timeReqCount ?? 0) > 0 && (
          <Link href="/hr/time-requests" className="card p-4 flex items-center justify-between text-sm hover:border-purple">
            <span>มีคำขอแก้เวลาเข้า-ออกรออนุมัติ <b>{timeReqCount}</b> รายการ</span><span className="text-purple font-semibold">ดู →</span>
          </Link>
        )}

        {needsReview.length > 0 && (
          <div className="card p-4 flex items-start gap-3 border-yellow/60 bg-yellow/10">
            <AlertTriangle className="text-[#8a6a00] shrink-0" size={20} />
            <div className="text-sm">
              <b>มีข้อมูลพนักงานที่ต้องตรวจ {needsReview.length} คน</b> —{" "}
              {needsReview.map((e) => (
                <Link key={e.id} href={`/hr/employees/${e.id}`} className="underline mr-2">{e.first_name}</Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <section className="card p-5">
            <h2 className="font-display font-bold mb-3">สถานะวันนี้</h2>
            <table className="tbl">
              <thead><tr><th>พนักงาน</th><th>เข้า</th><th>ออก</th><th>สถานะ</th></tr></thead>
              <tbody>
                {attendance.map((a) => (
                  <tr key={a.id}>
                    <td>{fullName(a.employees)}</td>
                    <td>{fmtTime(a.check_in_at)}</td>
                    <td>{fmtTime(a.check_out_at)}</td>
                    <td>
                      {a.is_late ? <span className="badge-late">สาย {a.late_minutes} น.</span> : <span className="badge-ok">ตรงเวลา</span>}
                      {a.check_in_in_range === false && <span className="badge-rejected ml-1">นอกพื้นที่</span>}
                    </td>
                  </tr>
                ))}
                {notIn.map((e) => (
                  <tr key={e.id} className="text-ink-soft">
                    <td>{fullName(e)}</td><td>—</td><td>—</td><td><span className="badge-off">ยังไม่เช็คอิน</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-5">
            <h2 className="font-display font-bold mb-3">รออนุมัติ</h2>
            <ul className="divide-y divide-line text-sm">
              {(leaves as LeaveRequest[] | null)?.map((l) => (
                <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{fullName(l.employees)} · {l.leave_types?.name_th}</div>
                    <div className="text-xs text-ink-soft">{fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.days} วัน</div>
                  </div>
                  <Link href="/hr/leave" className="btn-outline py-1.5 px-3 text-xs">ดู</Link>
                </li>
              ))}
              {(ots as OtRequest[] | null)?.map((o) => (
                <li key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{fullName(o.employees)} · OT {o.hours_requested} ชม.</div>
                    <div className="text-xs text-ink-soft">{fmtDate(o.work_date)} {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)}</div>
                  </div>
                  <Link href="/hr/ot" className="btn-outline py-1.5 px-3 text-xs">ดู</Link>
                </li>
              ))}
              {!leaves?.length && !ots?.length && <li className="py-6 text-center text-ink-soft">ไม่มีรายการค้าง</li>}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  // ---- staff dashboard ----
  const empId = session.employee?.id;
  const [{ data: todayAtt }, { data: myLeaves }, { data: myOts }] = await Promise.all([
    supabase.from("attendance").select("*").eq("employee_id", empId ?? "").eq("work_date", today).maybeSingle(),
    supabase.from("leave_requests").select("*, leave_types(name_th)").eq("employee_id", empId ?? "").order("created_at", { ascending: false }).limit(5),
    supabase.from("ot_requests").select("*").eq("employee_id", empId ?? "").order("created_at", { ascending: false }).limit(5),
  ]);
  const a = todayAtt as Attendance | null;

  return (
    <div className="space-y-6">
      <Header title={`สวัสดี ${session.employee?.nickname ?? session.employee?.first_name ?? ""}`} sub={fmtDate(today, { weekday: "long" })} />

      <div className="grid sm:grid-cols-3 gap-4">
        <Link href="/hr/checkin" className="card p-5 hover:border-purple transition">
          <div className="flex items-center gap-2 text-purple font-semibold"><MapPin size={18} /> เช็คอิน / เช็คเอาท์</div>
          <div className="mt-3 text-sm">
            เข้า: <b>{fmtTime(a?.check_in_at)}</b> {a?.is_late && <span className="badge-late ml-1">สาย {a.late_minutes} น.</span>}
            <br />ออก: <b>{fmtTime(a?.check_out_at)}</b>
          </div>
        </Link>
        <Link href="/hr/leave" className="card p-5 hover:border-purple transition">
          <div className="flex items-center gap-2 text-purple font-semibold"><CalendarDays size={18} /> ลางาน</div>
          <div className="mt-3 text-sm text-ink-soft">ยื่นใบลา / ดูโควต้าคงเหลือ</div>
        </Link>
        <Link href="/hr/ot" className="card p-5 hover:border-purple transition">
          <div className="flex items-center gap-2 text-purple font-semibold"><BadgeCheck size={18} /> ขอ OT</div>
          <div className="mt-3 text-sm text-ink-soft">ยื่นขอ OT ล่วงหน้าหรือย้อนหลัง</div>
        </Link>
      </div>
      <Link href="/hr/payslips" className="card p-4 flex items-center justify-between hover:border-purple text-sm"><span className="flex items-center gap-2 font-semibold text-purple"><Wallet size={16} /> สลิปเงินเดือนของฉัน</span><span className="text-ink-soft">ดู →</span></Link>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3">ใบลาล่าสุด</h2>
          <ul className="divide-y divide-line text-sm">
            {(myLeaves as LeaveRequest[] | null)?.map((l) => (
              <li key={l.id} className="py-2.5 flex justify-between gap-3">
                <div>{l.leave_types?.name_th} · {fmtDate(l.start_date)} – {fmtDate(l.end_date)}</div>
                <span className={statusBadgeClass(l.status)}>{STATUS_TH[l.status]}</span>
              </li>
            ))}
            {!myLeaves?.length && <li className="py-6 text-center text-ink-soft">ยังไม่มีใบลา</li>}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3">OT ล่าสุด</h2>
          <ul className="divide-y divide-line text-sm">
            {(myOts as OtRequest[] | null)?.map((o) => (
              <li key={o.id} className="py-2.5 flex justify-between gap-3">
                <div>{fmtDate(o.work_date)} · {o.start_time.slice(0, 5)}–{o.end_time.slice(0, 5)} ({o.hours_requested} ชม.)</div>
                <span className={statusBadgeClass(o.status)}>{STATUS_TH[o.status]}</span>
              </li>
            ))}
            {!myOts?.length && <li className="py-6 text-center text-ink-soft">ยังไม่มีรายการ OT</li>}
          </ul>
        </section>
      </div>

      <Link href="/hr/employees" className="inline-flex items-center gap-2 text-sm text-purple font-semibold"><Users size={16} /> ดูรายชื่อเพื่อนร่วมงาน</Link>
    </div>
  );
}

