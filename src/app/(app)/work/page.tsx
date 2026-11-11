import Link from "next/link";
import { Plus, Bell } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, Stat } from "@/components/ui";
import { TaskCard } from "@/components/work/TaskCard";
import { myRooms, ensureRoutines, TASK_SELECT, isOverdue, loadDirectory, fillEmployees } from "@/lib/work/queries";
import type { Task } from "@/lib/work/types";
import { fmtDate, todayBkk } from "@/lib/format";

export const dynamic = "force-dynamic";
const MAIN_ROOMS = ["teamwork", "gc-room", "sw-room"];

export default async function WorkHome() {
  const session = await getSession();
  const supabase = await createClient();
  await ensureRoutines(supabase);
  const rooms = await myRooms(supabase, session.employee?.id ?? null, session.isAdmin);
  const empId = session.employee?.id;

  const [{ data: tasksRaw }, { count: unread }, { data: chatUnread }, dir] = await Promise.all([
    supabase.from("work_tasks").select(TASK_SELECT).not("status", "in", "(accepted,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("work_notifications").select("id", { count: "exact", head: true }).eq("user_id", session.appUser.id).is("read_at", null),
    supabase.rpc("room_unread_counts"),
    loadDirectory(supabase),
  ]);
  const unreadByRoom = Object.fromEntries(((chatUnread ?? []) as { room_id: string; unread: number }[]).map((x) => [x.room_id, x.unread]));
  const tasks = fillEmployees(tasksRaw as Task[], dir, "assignee_id");
  const mine = tasks.filter((t) => t.assignee_id === empId);
  const assignedByMe = tasks.filter((t) => t.created_by === session.appUser.id && t.assignee_id !== empId);
  const review = tasks.filter((t) => t.status === "done" && (session.isAdmin || t.created_by === session.appUser.id));
  const overdue = tasks.filter(isOverdue);
  const countByRoom = Object.fromEntries(rooms.map((r) => [r.id, tasks.filter((t) => t.room_id === r.id).length]));

  return (
    <div className="space-y-6">
      <Header title="งาน" sub={fmtDate(todayBkk(), { weekday: "long" })} action={
        <div className="flex gap-2">
          <Link href="/work/notifications" className="btn-outline relative"><Bell size={16} /> แจ้งเตือน{(unread ?? 0) > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red text-white text-[10px] rounded-full h-5 min-w-5 px-1 grid place-items-center">{unread}</span>}</Link>
          <Link href="/work/tasks/new" className="btn-primary"><Plus size={16} /> สั่งงาน</Link>
        </div>
      } />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="งานของฉัน" value={mine.length} tone="purple" />
        <Stat label="เลยกำหนด" value={overdue.length} tone="coral" />
        <Stat label="รอฉันตรวจรับ" value={review.length} tone="teal" />
        <Stat label="ที่ฉันสั่ง (ค้าง)" value={assignedByMe.length} tone="yellow" />
      </div>

      <section className="space-y-4">
        {[{ title: "ห้องหลัก", list: rooms.filter((r) => MAIN_ROOMS.includes(r.key)), cols: "sm:grid-cols-3" }, { title: "ห้องย่อย", list: rooms.filter((r) => !MAIN_ROOMS.includes(r.key)), cols: "sm:grid-cols-2 lg:grid-cols-4" }].filter((g) => g.list.length).map((g) => (
          <div key={g.title}>
            <h2 className="font-display font-bold mb-3">{g.title} <span className="text-xs font-normal text-ink-soft">{g.title === "ห้องหลัก" ? "ทั้งบริษัท · ทีม GC · ทีม SW" : "ตามหน้าที่งาน"}</span></h2>
            <div className={`grid ${g.cols} gap-3`}>
              {g.list.map((r) => (
                <Link key={r.id} href={`/work/rooms/${r.key}`} className={`card flex items-center gap-3 hover:border-purple transition ${g.title === "ห้องหลัก" ? "p-5" : "p-4"}`}>
                  <div className={`${g.title === "ห้องหลัก" ? "h-12 w-12 text-lg" : "h-10 w-10"} rounded-xl text-white grid place-items-center font-display font-bold`} style={{ background: r.color }}>{r.name[0]}</div>
                  <div className="min-w-0 flex-1"><div className="font-semibold truncate">{r.name}</div><div className="text-xs text-ink-soft">{countByRoom[r.id] ?? 0} งานค้าง</div></div>
                  {(unreadByRoom[r.id] ?? 0) > 0 && <Link href={`/work/rooms/${r.key}?tab=chat`} className="bg-red text-white text-[11px] rounded-full px-2 py-0.5 font-semibold">{unreadByRoom[r.id]} แชท</Link>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-display font-bold mb-3">งานของฉัน ({mine.length})</h2>
          <div className="space-y-2">
            {mine.slice(0, 20).map((t) => <TaskCard key={t.id} t={t} />)}
            {!mine.length && <div className="card p-6 text-center text-ink-soft text-sm">ไม่มีงานค้าง 🎉</div>}
          </div>
        </section>
        <section className="space-y-6">
          {review.length > 0 && (
            <div>
              <h2 className="font-display font-bold mb-3">รอตรวจรับ ({review.length})</h2>
              <div className="space-y-2">{review.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {overdue.length > 0 && (
            <div>
              <h2 className="font-display font-bold mb-3 text-red">เลยกำหนด ({overdue.length})</h2>
              <div className="space-y-2">{overdue.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {assignedByMe.length > 0 && (
            <div>
              <h2 className="font-display font-bold mb-3">ที่ฉันสั่ง ({assignedByMe.length})</h2>
              <div className="space-y-2">{assignedByMe.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
