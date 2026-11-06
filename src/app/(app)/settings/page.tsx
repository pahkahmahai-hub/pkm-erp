import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { saveGeneral, saveLeaveTypes, addHoliday, deleteHoliday, addUser, setUserRole, toggleUser } from "./actions";
import type { AppUser, LeaveType } from "@/lib/types";

export const dynamic = "force-dynamic";

const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const session = await requireAdmin();
  const { saved, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: settings }, { data: lt }, { data: holidays }, { data: users }] = await Promise.all([
    supabase.from("settings").select("key, value"),
    supabase.from("leave_types").select("*").order("sort_order"),
    supabase.from("holidays").select("*").order("holiday_date"),
    supabase.from("app_users").select("*, employees(first_name, last_name, emp_code)").order("role").order("email"),
  ]);
  const S = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value])) as Record<string, unknown>;
  const office = S.office_location as { name: string; lat: number; lng: number; radius_m: number };
  const hours = S.work_hours as { start: string; end: string };
  const grace = Number(S.late_grace_minutes ?? 0);
  const workdays = (S.workdays as number[]) ?? [1, 2, 3, 4, 5];
  const company = S.company as { name_th: string };

  return (
    <div className="space-y-8">
      <Header title="ตั้งค่าระบบ" sub={company?.name_th} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <form action={saveGeneral} className="card p-6 space-y-5">
        <h2 className="font-display font-bold">จุดเช็คอินและเวลางาน</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="md:col-span-2"><label className="label">ชื่อสถานที่</label><input name="office_name" defaultValue={office?.name} className="input" /></div>
          <div><label className="label">Latitude</label><input name="lat" type="number" step="any" defaultValue={office?.lat} className="input font-mono" /></div>
          <div><label className="label">Longitude</label><input name="lng" type="number" step="any" defaultValue={office?.lng} className="input font-mono" /></div>
          <div><label className="label">รัศมี (เมตร)</label><input name="radius_m" type="number" defaultValue={office?.radius_m} className="input" /></div>
          <div><label className="label">เวลาเข้างาน</label><input name="start" type="time" defaultValue={hours?.start} className="input" /></div>
          <div><label className="label">เวลาเลิกงาน</label><input name="end" type="time" defaultValue={hours?.end} className="input" /></div>
          <div><label className="label">ผ่อนผันสาย (นาที)</label><input name="grace" type="number" defaultValue={grace} className="input" /></div>
        </div>
        <div>
          <label className="label">วันทำงาน</label>
          <div className="flex gap-2 flex-wrap">
            {DOW.map((d, i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm rounded-xl border border-line px-3 py-2 bg-white">
                <input type="checkbox" name={`wd_${i + 1}`} defaultChecked={workdays.includes(i + 1)} className="accent-purple" /> {d}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary">บันทึก</button>
      </form>

      <div className="grid lg:grid-cols-2 gap-6">
        <form action={saveLeaveTypes} className="card p-6 space-y-4">
          <h2 className="font-display font-bold">โควต้าการลา (วัน/ปี)</h2>
          {((lt ?? []) as LeaveType[]).map((t) => (
            <div key={t.code} className="flex items-center gap-3">
              <input type="hidden" name="code" value={t.code} />
              <span className="w-28 text-sm">{t.name_th}</span>
              <input name={`quota_${t.code}`} type="number" step="0.5" defaultValue={t.quota_days} className="input w-28" />
            </div>
          ))}
          <button className="btn-primary">บันทึก</button>
        </form>

        <section className="card p-6 space-y-4">
          <h2 className="font-display font-bold">วันหยุดบริษัท</h2>
          <form action={addHoliday} className="flex gap-2">
            <input type="date" name="holiday_date" className="input w-44" required />
            <input name="name" className="input" placeholder="ชื่อวันหยุด" required />
            <button className="btn-outline whitespace-nowrap">เพิ่ม</button>
          </form>
          <ul className="divide-y divide-line text-sm">
            {holidays?.map((h) => (
              <li key={h.holiday_date} className="py-2 flex justify-between">
                <span>{fmtDate(h.holiday_date, { weekday: "short" })} · {h.name}</span>
                <form action={deleteHoliday.bind(null, h.holiday_date)}><button className="text-xs text-red">ลบ</button></form>
              </li>
            ))}
            {!holidays?.length && <li className="py-4 text-ink-soft text-center">ยังไม่ได้เพิ่มวันหยุด</li>}
          </ul>
        </section>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="font-display font-bold">บัญชีผู้ใช้</h2>
        <form action={addUser} className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
          <input name="email" type="email" className="input" placeholder="อีเมล Gmail" required />
          <input name="display_name" className="input" placeholder="ชื่อที่แสดง" />
          <select name="role" className="input w-32"><option value="staff">พนักงาน</option><option value="admin">ผู้ดูแล</option></select>
          <button className="btn-outline">เพิ่มบัญชี</button>
        </form>
        <p className="text-xs text-ink-soft">บัญชีพนักงานปกติจะถูกสร้างจากหน้าทะเบียนพนักงาน — ที่นี่ใช้เพิ่มผู้ดูแลหรือบัญชีพิเศษ</p>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>อีเมล</th><th>ชื่อ</th><th>พนักงาน</th><th>บทบาท</th><th>สถานะ</th><th>ล็อกอินล่าสุด</th><th></th></tr></thead>
            <tbody>
              {(users as (AppUser & { employees: { first_name: string; last_name: string; emp_code: string } | null })[] | null)?.map((u) => {
                const isMe = u.id === session.appUser.id;
                return (
                  <tr key={u.id}>
                    <td className="text-xs">{u.email}{isMe && <span className="badge-off ml-1">คุณ</span>}</td>
                    <td>{u.display_name ?? "—"}</td>
                    <td className="text-xs">{u.employees ? `${u.employees.emp_code} ${u.employees.first_name}` : "—"}</td>
                    <td><span className={u.role === "admin" ? "badge-approved" : "badge-off"}>{u.role === "admin" ? "ผู้ดูแล" : "พนักงาน"}</span></td>
                    <td>{u.is_active ? <span className="badge-ok">ใช้งาน</span> : <span className="badge-rejected">ระงับ</span>}</td>
                    <td className="text-xs text-ink-soft">{u.auth_user_id ? fmtDateTime(u.last_login_at) : "ยังไม่เคย"}</td>
                    <td className="whitespace-nowrap">
                      {!isMe && (
                        <div className="flex gap-2">
                          <form action={setUserRole.bind(null, u.id, u.role === "admin" ? "staff" : "admin")}><button className="text-xs text-purple">{u.role === "admin" ? "ลดเป็นพนักงาน" : "ตั้งเป็นผู้ดูแล"}</button></form>
                          <form action={toggleUser.bind(null, u.id, !u.is_active)}><button className="text-xs text-red">{u.is_active ? "ระงับ" : "เปิดใช้"}</button></form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
