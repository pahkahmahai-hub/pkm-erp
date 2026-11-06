import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fullName, STATUS_TH, statusBadgeClass, todayBkk } from "@/lib/format";
import { submitTimeRequest, cancelTimeRequest, reviewTimeRequest } from "./actions";

export const dynamic = "force-dynamic";

interface TimeReq {
  id: string; employee_id: string; work_date: string; requested_in: string | null; requested_out: string | null; reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled"; admin_note: string | null; created_at: string;
  employees?: { emp_code: string; first_name: string; last_name: string; nickname: string | null } | null;
}
const hm = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default async function TimeRequestsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; tab?: string }> }) {
  const { saved, error, tab } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();

  if (session.isAdmin) {
    const showAll = tab === "all";
    let q = supabase.from("attendance_requests").select("*, employees(emp_code, first_name, last_name, nickname)").order("created_at", { ascending: false });
    if (!showAll) q = q.eq("status", "pending");
    const { data } = await q.limit(200);
    const rows = (data ?? []) as TimeReq[];
    return (
      <div className="space-y-6">
        <Header title="คำขอแก้เวลาเข้า-ออก" sub={showAll ? "ทั้งหมด" : "รออนุมัติ"} action={
          <div className="flex gap-2">
            <a href="/hr/time-requests" className={!showAll ? "btn-primary" : "btn-outline"}>รออนุมัติ</a>
            <a href="/hr/time-requests?tab=all" className={showAll ? "btn-primary" : "btn-outline"}>ทั้งหมด</a>
          </div>
        } />
        {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="card p-4 grid md:grid-cols-[1fr_auto] gap-4 text-sm">
              <div>
                <div className="font-semibold">{fullName(r.employees)} <span className="text-ink-soft font-normal">· {r.employees?.emp_code}</span></div>
                <div className="mt-1">{fmtDate(r.work_date, { weekday: "short" })} · เข้า <b>{hm(r.requested_in)}</b> · ออก <b>{hm(r.requested_out)}</b></div>
                <div className="text-ink-soft mt-1">เหตุผล: {r.reason}</div>
                <div className="text-xs text-ink-soft mt-1">ยื่นเมื่อ {fmtDate(r.created_at)} · <span className={statusBadgeClass(r.status)}>{STATUS_TH[r.status]}</span>{r.admin_note && ` · ${r.admin_note}`}</div>
              </div>
              {r.status === "pending" && (
                <form className="flex flex-col gap-2 md:w-64">
                  <input name="admin_note" className="input" placeholder="หมายเหตุ (ถ้ามี)" />
                  <div className="flex gap-2">
                    <button formAction={reviewTimeRequest.bind(null, r.id, "approved")} className="btn-primary flex-1">อนุมัติ</button>
                    <button formAction={reviewTimeRequest.bind(null, r.id, "rejected")} className="btn-danger flex-1">ไม่อนุมัติ</button>
                  </div>
                  <p className="text-[11px] text-ink-soft">อนุมัติแล้วระบบจะเขียนเวลาลงบันทึกและคำนวณสาย/ขาดใหม่</p>
                </form>
              )}
            </div>
          ))}
          {!rows.length && <div className="card p-8 text-center text-ink-soft">ไม่มีรายการ</div>}
        </div>
      </div>
    );
  }

  const { data: mine } = await supabase.from("attendance_requests").select("*").eq("employee_id", session.employee?.id ?? "").order("created_at", { ascending: false }).limit(50);
  const rows = (mine ?? []) as TimeReq[];
  return (
    <div className="space-y-6">
      <Header title="ขอแก้เวลาเข้า-ออก" sub="กรณีลืมเช็คอิน / เช็คเอาท์ หรือเวลาไม่ถูกต้อง" />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={submitTimeRequest} className="card p-6 grid md:grid-cols-3 gap-4">
        <h2 className="font-display font-bold md:col-span-3">ยื่นคำขอ</h2>
        <div><label className="label">วันที่</label><input type="date" name="work_date" defaultValue={todayBkk()} max={todayBkk()} className="input" required /></div>
        <div><label className="label">เวลาเข้าจริง (ถ้าลืมเช็คอิน)</label><input type="time" name="requested_in" className="input" /></div>
        <div><label className="label">เวลาออกจริง (ถ้าลืมเช็คเอาท์)</label><input type="time" name="requested_out" className="input" /></div>
        <div className="md:col-span-3"><label className="label">เหตุผล *</label><input name="reason" className="input" placeholder="เช่น แบตมือถือหมด / ออกไปส่งของแล้วลืมกด" required /></div>
        <div className="md:col-span-3"><button className="btn-primary">ส่งคำขอ</button></div>
      </form>
      <section className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>วันที่</th><th>เข้า</th><th>ออก</th><th>เหตุผล</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.work_date)}</td><td>{hm(r.requested_in)}</td><td>{hm(r.requested_out)}</td>
                <td className="text-xs">{r.reason}</td>
                <td><span className={statusBadgeClass(r.status)}>{STATUS_TH[r.status]}</span>{r.admin_note && <div className="text-xs text-ink-soft">{r.admin_note}</div>}</td>
                <td>{r.status === "pending" && <form action={cancelTimeRequest.bind(null, r.id)}><button className="text-xs text-red">ยกเลิก</button></form>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-center text-ink-soft py-8">ยังไม่มีคำขอ</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
