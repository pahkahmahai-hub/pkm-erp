import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fullName, STATUS_TH, statusBadgeClass, todayBkk } from "@/lib/format";
import { submitLeave, cancelLeave, reviewLeave } from "./actions";
import type { LeaveRequest, LeaveType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; tab?: string }> }) {
  const { saved, error, tab } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const year = todayBkk().slice(0, 4);

  const { data: types } = await supabase.from("leave_types").select("*").order("sort_order");
  const leaveTypes = (types ?? []) as LeaveType[];

  // ---------- admin view ----------
  if (session.isAdmin) {
    const showAll = tab === "all";
    let q = supabase
      .from("leave_requests")
      .select("*, employees(emp_code, first_name, last_name, nickname), leave_types(name_th)")
      .order("created_at", { ascending: false });
    if (!showAll) q = q.eq("status", "pending");
    const { data } = await q.limit(200);
    const rows = (data ?? []) as LeaveRequest[];

    return (
      <div className="space-y-6">
        <Header title="ใบลา" sub={showAll ? "ทั้งหมด" : "รออนุมัติ"} action={
          <div className="flex gap-2">
            <a href="/hr/leave" className={!showAll ? "btn-primary" : "btn-outline"}>รออนุมัติ</a>
            <a href="/hr/leave?tab=all" className={showAll ? "btn-primary" : "btn-outline"}>ทั้งหมด</a>
          </div>
        } />
        <div className="space-y-3">
          {rows.map((l) => (
            <div key={l.id} className="card p-4 grid md:grid-cols-[1fr_auto] gap-4">
              <div className="text-sm">
                <div className="font-semibold">{fullName(l.employees)} <span className="text-ink-soft font-normal">· {l.employees?.emp_code}</span></div>
                <div className="mt-1"><span className="badge-off">{l.leave_types?.name_th}</span> {fmtDate(l.start_date)} – {fmtDate(l.end_date)} · <b>{l.days} วัน</b></div>
                {l.reason && <div className="mt-1 text-ink-soft">เหตุผล: {l.reason}</div>}
                <div className="mt-1 text-xs text-ink-soft">ยื่นเมื่อ {fmtDate(l.created_at)} · <span className={statusBadgeClass(l.status)}>{STATUS_TH[l.status]}</span>{l.admin_note && ` · ${l.admin_note}`}</div>
              </div>
              {l.status === "pending" && (
                <form className="flex flex-col gap-2 md:w-64">
                  <input name="admin_note" className="input" placeholder="หมายเหตุ (ถ้ามี)" />
                  <div className="flex gap-2">
                    <button formAction={reviewLeave.bind(null, l.id, "approved")} className="btn-primary flex-1">อนุมัติ</button>
                    <button formAction={reviewLeave.bind(null, l.id, "rejected")} className="btn-danger flex-1">ไม่อนุมัติ</button>
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

  // ---------- staff view ----------
  const empId = session.employee?.id ?? "";
  const { data: mine } = await supabase
    .from("leave_requests")
    .select("*, leave_types(name_th)")
    .eq("employee_id", empId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (mine ?? []) as LeaveRequest[];
  const used: Record<string, number> = {};
  rows.filter((r) => r.status === "approved" && r.start_date.startsWith(year)).forEach((r) => (used[r.leave_type] = (used[r.leave_type] ?? 0) + Number(r.days)));

  return (
    <div className="space-y-6">
      <Header title="ลางาน" sub={`โควต้าปี ${Number(year) + 543}`} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ส่งใบลาแล้ว รอผู้ดูแลอนุมัติ</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <div className="grid sm:grid-cols-3 gap-4">
        {leaveTypes.map((t) => {
          const u = used[t.code] ?? 0;
          const pct = Math.min(100, (u / t.quota_days) * 100);
          return (
            <div key={t.code} className="card p-4">
              <div className="text-xs font-semibold text-ink-soft">{t.name_th}</div>
              <div className="font-display text-2xl font-bold mt-1">{t.quota_days - u} <span className="text-sm font-normal text-ink-soft">/ {t.quota_days} วัน</span></div>
              <div className="h-1.5 rounded-full bg-lavender/40 mt-2"><div className="h-full rounded-full bg-purple" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>

      <form action={submitLeave} className="card p-6 grid md:grid-cols-2 gap-4">
        <h2 className="font-display font-bold md:col-span-2">ยื่นใบลา</h2>
        <div>
          <label className="label">ประเภท</label>
          <select name="leave_type" className="input" required>
            {leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.name_th}{t.requires_doc ? " (แนบใบรับรองแพทย์ถ้าเกิน 3 วัน)" : ""}</option>)}
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="half_day" className="accent-purple" /> ลาครึ่งวัน</label>
        </div>
        <div><label className="label">ตั้งแต่วันที่</label><input type="date" name="start_date" className="input" required /></div>
        <div><label className="label">ถึงวันที่</label><input type="date" name="end_date" className="input" /></div>
        <div className="md:col-span-2"><label className="label">เหตุผล</label><input name="reason" className="input" /></div>
        <div className="md:col-span-2"><button className="btn-primary">ส่งใบลา</button></div>
      </form>

      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>ประเภท</th><th>วันที่</th><th>วัน</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{l.leave_types?.name_th}</td>
                <td>{fmtDate(l.start_date)}{l.end_date !== l.start_date && ` – ${fmtDate(l.end_date)}`}</td>
                <td>{l.days}</td>
                <td><span className={statusBadgeClass(l.status)}>{STATUS_TH[l.status]}</span>{l.admin_note && <div className="text-xs text-ink-soft">{l.admin_note}</div>}</td>
                <td>{l.status === "pending" && <form action={cancelLeave.bind(null, l.id)}><button className="text-xs text-red">ยกเลิก</button></form>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="text-center text-ink-soft py-8">ยังไม่มีใบลา</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
