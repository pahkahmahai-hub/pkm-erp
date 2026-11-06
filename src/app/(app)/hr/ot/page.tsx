import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fullName, STATUS_TH, statusBadgeClass, todayBkk } from "@/lib/format";
import { submitOt, cancelOt, reviewOt } from "./actions";
import type { OtRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

const hm = (t: string) => t.slice(0, 5);

export default async function OtPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; tab?: string }> }) {
  const { saved, error, tab } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const { data: hours } = await supabase.from("settings").select("value").eq("key", "work_hours").single();
  const workEnd = (hours?.value as { end: string })?.end ?? "17:30";

  if (session.isAdmin) {
    const showAll = tab === "all";
    let q = supabase.from("ot_requests").select("*, employees(emp_code, first_name, last_name, nickname)").order("work_date", { ascending: false });
    if (!showAll) q = q.eq("status", "pending");
    const { data } = await q.limit(200);
    const rows = (data ?? []) as OtRequest[];

    return (
      <div className="space-y-6">
        <Header title="คำขอ OT" sub={showAll ? "ทั้งหมด" : "รออนุมัติ"} action={
          <div className="flex gap-2">
            <a href="/hr/ot" className={!showAll ? "btn-primary" : "btn-outline"}>รออนุมัติ</a>
            <a href="/hr/ot?tab=all" className={showAll ? "btn-primary" : "btn-outline"}>ทั้งหมด</a>
          </div>
        } />
        <div className="space-y-3">
          {rows.map((o) => (
            <div key={o.id} className="card p-4 grid md:grid-cols-[1fr_auto] gap-4">
              <div className="text-sm">
                <div className="font-semibold">{fullName(o.employees)} <span className="text-ink-soft font-normal">· {o.employees?.emp_code}</span></div>
                <div className="mt-1">{fmtDate(o.work_date, { weekday: "short" })} · {hm(o.start_time)}–{hm(o.end_time)} · <b>{o.hours_requested} ชม.</b>
                  {o.status === "approved" && o.hours_approved != null && o.hours_approved !== o.hours_requested && <span className="text-ink-soft"> (อนุมัติ {o.hours_approved} ชม.)</span>}
                </div>
                {o.reason && <div className="mt-1 text-ink-soft">งาน: {o.reason}</div>}
                <div className="mt-1 text-xs text-ink-soft">ยื่นเมื่อ {fmtDate(o.created_at)} · <span className={statusBadgeClass(o.status)}>{STATUS_TH[o.status]}</span>{o.admin_note && ` · ${o.admin_note}`}</div>
              </div>
              {o.status === "pending" && (
                <form className="flex flex-col gap-2 md:w-64">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-ink-soft whitespace-nowrap">ชม.ที่อนุมัติ</label>
                    <input name="hours_approved" type="number" step="0.5" min="0" defaultValue={o.hours_requested} className="input" />
                  </div>
                  <input name="admin_note" className="input" placeholder="หมายเหตุ (ถ้ามี)" />
                  <div className="flex gap-2">
                    <button formAction={reviewOt.bind(null, o.id, "approved")} className="btn-primary flex-1">อนุมัติ</button>
                    <button formAction={reviewOt.bind(null, o.id, "rejected")} className="btn-danger flex-1">ไม่อนุมัติ</button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {!rows.length && <div className="card p-8 text-center text-ink-soft">ไม่มีรายการ</div>}
        </div>
      </div>
    );
  }

  const { data: mine } = await supabase.from("ot_requests").select("*").eq("employee_id", session.employee?.id ?? "").order("work_date", { ascending: false }).limit(50);
  const rows = (mine ?? []) as OtRequest[];
  const ym = todayBkk().slice(0, 7);
  const monthApproved = rows.filter((r) => r.status === "approved" && r.work_date.startsWith(ym)).reduce((s, r) => s + Number(r.hours_approved ?? r.hours_requested), 0);

  return (
    <div className="space-y-6">
      <Header title="ขอ OT" sub={`เดือนนี้อนุมัติแล้ว ${monthApproved} ชม.`} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ส่งคำขอ OT แล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <form action={submitOt} className="card p-6 grid md:grid-cols-3 gap-4">
        <h2 className="font-display font-bold md:col-span-3">ยื่นคำขอ OT <span className="text-xs font-normal text-ink-soft">(ยื่นล่วงหน้าหรือย้อนหลังได้)</span></h2>
        <div><label className="label">วันที่</label><input type="date" name="work_date" defaultValue={todayBkk()} className="input" required /></div>
        <div><label className="label">เริ่ม</label><input type="time" name="start_time" defaultValue={workEnd} className="input" required /></div>
        <div><label className="label">สิ้นสุด</label><input type="time" name="end_time" className="input" required /></div>
        <div className="md:col-span-3"><label className="label">งานที่ทำ</label><input name="reason" className="input" placeholder="เช่น แพ็คออเดอร์ห้างล็อตใหญ่" /></div>
        <div className="md:col-span-3"><button className="btn-primary">ส่งคำขอ</button></div>
      </form>

      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>วันที่</th><th>เวลา</th><th>ชม.</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{fmtDate(o.work_date)}</td>
                <td>{hm(o.start_time)}–{hm(o.end_time)}</td>
                <td>{o.status === "approved" ? o.hours_approved ?? o.hours_requested : o.hours_requested}</td>
                <td><span className={statusBadgeClass(o.status)}>{STATUS_TH[o.status]}</span>{o.admin_note && <div className="text-xs text-ink-soft">{o.admin_note}</div>}</td>
                <td>{o.status === "pending" && <form action={cancelOt.bind(null, o.id)}><button className="text-xs text-red">ยกเลิก</button></form>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="text-center text-ink-soft py-8">ยังไม่มีคำขอ OT</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
