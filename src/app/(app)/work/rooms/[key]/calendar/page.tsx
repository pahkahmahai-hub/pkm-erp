import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Tags } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { TASK_SELECT, ensureRoutines, loadDirectory, fillEmployees } from "@/lib/work/queries";
import type { Room, RoomMember, Task, Topic } from "@/lib/work/types";
import { WeekCalendar } from "@/components/work/WeekCalendar";
import { addDays, mondayOf, fmtDM } from "@/lib/work/deliveries";
import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

export default async function RoomCalendarPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ week?: string; created?: string; error?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  await ensureRoutines(supabase);
  const { data: room } = await supabase.from("work_rooms").select("*").eq("key", key).maybeSingle();
  if (!room) notFound();
  const r = room as Room;
  const today = todayBkk();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? mondayOf(sp.week!) : mondayOf(today);
  const weekEnd = addDays(week, 6);

  const [{ data: members }, dir, { data: topics }, tasksRes] = await Promise.all([
    supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", r.id),
    loadDirectory(supabase),
    supabase.from("work_topics").select("*").eq("room_id", r.id).eq("is_active", true).order("sort_order"),
    supabase.from("work_tasks").select(TASK_SELECT + ", work_topics(id, name, color)").eq("room_id", r.id).neq("status", "cancelled")
      .or(`and(start_date.gte.${week},start_date.lte.${weekEnd}),and(start_date.is.null,due_date.gte.${week},due_date.lte.${weekEnd})`).order("due_time").order("created_at"),
  ]);
  const mem = fillEmployees(members as RoomMember[], dir, "employee_id");
  if (!session.isAdmin && !mem.some((m) => m.employee_id === session.employee?.id)) redirect("/work?denied=1");
  const tasks = fillEmployees((tasksRes.data ?? []) as unknown as Task[], dir, "assignee_id");
  const rows = mem.map((m) => ({ id: m.employee_id, name: m.employees?.nickname ?? m.employees?.first_name ?? "—", is_lead: m.is_lead }));
  const href = (w: string) => `/work/rooms/${key}/calendar?week=${w}`;

  return (
    <div className="space-y-4">
      <Header crumbs={[...WORK, { href: `/work/rooms/${key}`, label: r.name }]} title={`ปฏิทิน ${r.name}`} sub="ทุกคนลงงานของตัวเองได้ · เห็นพร้อมกันทั้งทีม · กดช่องว่างเพื่อลงงาน กดงานเพื่อเปิดรายละเอียด/แนบรูป"
        action={<span className="flex gap-2"><Link href={`/work/rooms/${key}`} className="btn-outline"><ListChecks size={16} /> บอร์ดงาน</Link><Link href={`/work/rooms/${key}/topics`} className="btn-outline"><Tags size={16} /> หัวข้อ Routine</Link></span>} />
      {sp.created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลงงาน #{sp.created} แล้ว</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={href(addDays(week, -7))} className="btn-outline py-1 px-2"><ChevronLeft size={16} /></Link>
        <Link href={href(mondayOf(today))} className="btn-outline py-1 px-3 text-xs">สัปดาห์นี้</Link>
        <Link href={href(addDays(week, 7))} className="btn-outline py-1 px-2"><ChevronRight size={16} /></Link>
        <span className="font-display font-bold ml-2">สัปดาห์ {fmtDM(week)} – {fmtDM(weekEnd)} {Number(week.slice(0, 4)) + 543}</span>
      </div>
      <WeekCalendar roomId={r.id} roomKey={key} week={week} today={today} rows={rows} tasks={tasks} topics={(topics ?? []) as Topic[]} myEmployeeId={session.employee?.id ?? null} isAdmin={session.isAdmin} />
    </div>
  );
}
