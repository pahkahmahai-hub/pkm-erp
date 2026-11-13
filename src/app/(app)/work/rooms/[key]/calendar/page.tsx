import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Tags } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { TASK_SELECT, ensureRoutines, loadDirectory, fillEmployees, roomRights } from "@/lib/work/queries";
import type { Room, RoomMember, Task, Topic } from "@/lib/work/types";
import { WeekCalendar, MonthTaskCalendar } from "@/components/work/WeekCalendar";
import { RoomTabs } from "@/components/work/RoomTabs";
import { addDays, addMonths, mondayOf, fmtDM, TH_MONTHS } from "@/lib/work/deliveries";
import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

export default async function RoomCalendarPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ week?: string; view?: string; month?: string; created?: string; error?: string }> }) {
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
  const isMonth = sp.view === "month";
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : (sp.week ? week : today).slice(0, 7);
  const [my, mm] = month.split("-").map(Number);
  // ช่วงที่ดึงงาน: สัปดาห์ หรือทั้งเดือน (รวมวันขอบสัปดาห์แรก/สุดท้าย)
  const from = isMonth ? addDays(month + "-01", -6) : week;
  const to = isMonth ? addDays(new Date(Date.UTC(my, mm, 0)).toISOString().slice(0, 10), 6) : weekEnd;

  const [{ data: members }, dir, { data: topics }, tasksRes] = await Promise.all([
    supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", r.id),
    loadDirectory(supabase),
    supabase.from("work_topics").select("*").eq("room_id", r.id).eq("is_active", true).order("sort_order"),
    supabase.from("work_tasks").select(TASK_SELECT + ", work_topics(id, name, color)").eq("room_id", r.id).neq("status", "cancelled")
      .or(`and(start_date.gte.${from},start_date.lte.${to}),and(start_date.is.null,due_date.gte.${from},due_date.lte.${to})`).order("due_time").order("created_at"),
  ]);
  const mem = fillEmployees(members as RoomMember[], dir, "employee_id");
  const rights = await roomRights(supabase, r.id, session.isAdmin);
  if (!rights.isMember) redirect("/work?denied=1");
  const tasks = fillEmployees((tasksRes.data ?? []) as unknown as Task[], dir, "assignee_id");
  const rows = mem.map((m) => ({ id: m.employee_id, name: m.employees?.nickname ?? m.employees?.first_name ?? "—", is_lead: m.is_lead }));
  const href = (w: string) => `/work/rooms/${key}/calendar?week=${w}`;
  const mhref = (m: string) => `/work/rooms/${key}/calendar?view=month&month=${m}`;
  const toggle = "rounded-lg px-3 py-1 text-xs font-semibold";

  return (
    <div className="space-y-4">
      <Header crumbs={[...WORK, { href: `/work/rooms/${key}`, label: r.name }]} title={`ปฏิทิน ${r.name}`} sub="ทุกคนลงงานของตัวเองได้ · เห็นพร้อมกันทั้งทีม · กดช่องว่างเพื่อลงงาน กดงานเพื่อเปิดรายละเอียด/แนบรูป"
        action={<span className="flex gap-2"><Link href={`/work/rooms/${key}`} className="btn-outline"><ListChecks size={16} /> บอร์ดงาน</Link><Link href={`/work/rooms/${key}/topics`} className="btn-outline"><Tags size={16} /> หัวข้อ Routine</Link></span>} />
      <RoomTabs roomKey={key} tab="calendar" />
      {sp.created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลงงาน #{sp.created} แล้ว</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex rounded-xl border border-line p-0.5 mr-2">
          <Link href={href(isMonth ? mondayOf(month === today.slice(0, 7) ? today : month + "-01") : week)} className={`${toggle} ${!isMonth ? "bg-purple text-white" : "text-ink-soft hover:bg-cream"}`}>สัปดาห์</Link>
          <Link href={mhref(month)} className={`${toggle} ${isMonth ? "bg-purple text-white" : "text-ink-soft hover:bg-cream"}`}>เดือน</Link>
        </span>
        {isMonth ? (<>
          <Link href={mhref(addMonths(month, -1))} className="btn-outline py-1 px-2"><ChevronLeft size={16} /></Link>
          <Link href={mhref(today.slice(0, 7))} className="btn-outline py-1 px-3 text-xs">เดือนนี้</Link>
          <Link href={mhref(addMonths(month, 1))} className="btn-outline py-1 px-2"><ChevronRight size={16} /></Link>
          <span className="font-display font-bold ml-2">{TH_MONTHS[mm - 1]} {my + 543}</span>
        </>) : (<>
          <Link href={href(addDays(week, -7))} className="btn-outline py-1 px-2"><ChevronLeft size={16} /></Link>
          <Link href={href(mondayOf(today))} className="btn-outline py-1 px-3 text-xs">สัปดาห์นี้</Link>
          <Link href={href(addDays(week, 7))} className="btn-outline py-1 px-2"><ChevronRight size={16} /></Link>
          <span className="font-display font-bold ml-2">สัปดาห์ {fmtDM(week)} – {fmtDM(weekEnd)} {Number(week.slice(0, 4)) + 543}</span>
        </>)}
      </div>
      {isMonth
        ? <MonthTaskCalendar key={month} roomId={r.id} roomKey={key} month={month} today={today} rows={rows} tasks={tasks} topics={(topics ?? []) as Topic[]} myEmployeeId={session.employee?.id ?? null} isAdmin={session.isAdmin} amLead={rights.isLead} />
        : <WeekCalendar key={week} roomId={r.id} roomKey={key} week={week} today={today} rows={rows} tasks={tasks} topics={(topics ?? []) as Topic[]} myEmployeeId={session.employee?.id ?? null} isAdmin={session.isAdmin} amLead={rights.isLead} />}
    </div>
  );
}
