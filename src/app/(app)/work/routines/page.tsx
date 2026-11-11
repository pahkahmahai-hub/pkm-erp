import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { myRooms, loadDirectory, fillEmployees } from "@/lib/work/queries";
import { saveRoutine, deleteRoutine } from "../actions";
import { DOW_TH, type Routine, type RoomMember } from "@/lib/work/types";

export const dynamic = "force-dynamic";

export default async function RoutinesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; edit?: string }> }) {
  const { saved, error, edit } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const rooms = await myRooms(supabase, session.employee?.id ?? null, session.isAdmin);
  const [{ data: routines }, { data: members }, { data: editing }, dir] = await Promise.all([
    supabase.from("work_routines").select("*, work_rooms(key, name, color), employees(first_name, nickname)").order("created_at"),
    supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").in("room_id", rooms.map((r) => r.id)),
    edit ? supabase.from("work_routines").select("*").eq("id", edit).maybeSingle() : Promise.resolve({ data: null }),
    loadDirectory(supabase),
  ]);
  const list = fillEmployees(routines as Routine[], dir, "assignee_id");
  const mem = fillEmployees(members as RoomMember[], dir, "employee_id");
  const e = editing as Routine | null;
  const emps = [...new Map(mem.map((m) => [m.employee_id, m.employees!])).values()];

  return (
    <div className="space-y-6">
      <Header title="งานประจำ" sub="ระบบสร้างงานให้อัตโนมัติตามวันในสัปดาห์ (เช่น Routine content จ–ศ)" />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <form action={saveRoutine.bind(null, e?.id ?? null)} className="card p-5 grid md:grid-cols-4 gap-3">
        <div className="md:col-span-4 font-display font-bold">{e ? `แก้ไข: ${e.title}` : "เพิ่มงานประจำ"}</div>
        <div><label className="label">ห้อง</label><select name="room_id" defaultValue={e?.room_id ?? rooms[0]?.id} className="input">{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="md:col-span-2"><label className="label">ชื่องาน</label><input name="title" defaultValue={e?.title ?? ""} className="input" required /></div>
        <div><label className="label">ผู้รับ</label><select name="assignee_id" defaultValue={e?.assignee_id ?? ""} className="input"><option value="">—</option>{emps.map((x) => <option key={x.id} value={x.id}>{x.nickname ?? x.first_name}</option>)}</select></div>
        <div className="md:col-span-3"><label className="label">รายละเอียด</label><input name="description" defaultValue={e?.description ?? ""} className="input" /></div>
        <div>
          <label className="label">วัน</label>
          <div className="flex gap-1 flex-wrap">{DOW_TH.map((d, i) => <label key={i} className="flex items-center gap-1 text-xs rounded-lg border border-line px-2 py-1.5"><input type="checkbox" name={`wd_${i + 1}`} defaultChecked={(e?.weekdays ?? [1, 2, 3, 4, 5]).includes(i + 1)} className="accent-purple" />{d}</label>)}</div>
        </div>
        {e && <label className="flex items-center gap-2 text-sm md:col-span-4"><input type="checkbox" name="is_active" value="on" defaultChecked={e.is_active} className="accent-purple" /><input type="hidden" name="is_active" value="off" /> เปิดใช้งาน</label>}
        <div className="md:col-span-4 flex gap-2"><button className="btn-primary">{e ? "บันทึก" : "เพิ่ม"}</button>{e && <a href="/work/routines" className="btn-ghost">ยกเลิก</a>}</div>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>ห้อง</th><th>งาน</th><th>ผู้รับ</th><th>วัน</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><span className="inline-block px-1.5 rounded text-white text-xs" style={{ background: r.work_rooms?.color }}>{r.work_rooms?.name}</span></td>
                <td><div className="font-medium">{r.title}</div><div className="text-xs text-ink-soft">{r.description}</div></td>
                <td>{r.employees?.nickname ?? r.employees?.first_name ?? "—"}</td>
                <td className="text-xs">{r.weekdays.map((d) => DOW_TH[d - 1]).join(" ")}</td>
                <td>{r.is_active ? <span className="badge-ok">ใช้งาน</span> : <span className="badge-off">ปิด</span>}</td>
                <td className="whitespace-nowrap text-xs"><a href={`/work/routines?edit=${r.id}`} className="text-purple mr-3">แก้ไข</a><form action={deleteRoutine.bind(null, r.id)} className="inline"><button className="text-red">ลบ</button></form></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="text-center text-ink-soft py-8">ยังไม่มีงานประจำ</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">* แก้ไข/ลบได้โดยผู้ดูแล และหัวหน้าห้อง (★)</p>
    </div>
  );
}
