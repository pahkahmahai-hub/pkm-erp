import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { TaskCard } from "@/components/work/TaskCard";
import { TASK_SELECT, ensureRoutines, loadDirectory, fillEmployees, type DirEmp } from "@/lib/work/queries";
import { STATUS_TH, type Room, type RoomMember, type Task, type TaskStatus } from "@/lib/work/types";
import { RoomChat } from "./RoomChat";
import { markRoomRead, setRoomMember } from "../../actions";
import type { ChatMessage } from "@/components/work/ChatBox";
import { MessageCircle, ListChecks, Truck } from "lucide-react";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];
const COLUMNS: TaskStatus[] = ["open", "in_progress", "returned", "done"];

export default async function RoomPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ who?: string; history?: string; deleted?: string; tab?: string }> }) {
  const { key } = await params;
  const { who = "", history, deleted, tab = "tasks" } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  await ensureRoutines(supabase);

  const { data: room } = await supabase.from("work_rooms").select("*").eq("key", key).maybeSingle();
  if (!room) notFound();
  const r = room as Room;
  const [{ data: members }, dir, { data: adminUsers }] = await Promise.all([
    supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", r.id),
    loadDirectory(supabase),
    supabase.from("app_users").select("employee_id").eq("role", "admin").not("employee_id", "is", null),
  ]);
  const mem = fillEmployees(members as RoomMember[], dir, "employee_id");
  // @mention targets: room members + admins (owners), label = nickname or first name
  const adminEmps = ((adminUsers ?? []) as { employee_id: string }[]).map((a) => dir.find((e) => e.id === a.employee_id) ?? null);
  const chatMembers = [...mem.map((m) => m.employees), ...adminEmps]
    .filter((e): e is DirEmp => !!e)
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
    .map((e) => ({ employee_id: e.id, label: (e.nickname ?? e.first_name).replace(/\s+/g, ""), first_name: e.first_name }));
  if (!session.isAdmin && !mem.some((m) => m.employee_id === session.employee?.id)) redirect("/work?denied=1");

  if (tab === "chat") {
    const { data: msgs } = await supabase.from("work_room_messages").select("*, app_users(display_name, email)").eq("room_id", r.id).order("created_at", { ascending: false }).limit(100);
    await markRoomRead(r.id);
    return (
      <div className="space-y-4">
        <Header crumbs={WORK} title={r.name} sub={r.description ?? undefined} action={<Link href={`/work/tasks/new?room=${r.key}`} className="btn-primary"><Plus size={16} /> สั่งงาน</Link>} />
        <RoomTabs roomKey={key} tab={tab} />
        <RoomChat roomId={r.id} roomKey={r.key} initial={((msgs ?? []) as ChatMessage[]).reverse()} meId={session.appUser.id} members={chatMembers} />
        <p className="text-xs text-ink-soft">สมาชิก: {mem.map((m) => (m.employees?.nickname ?? m.employees?.first_name) + (m.is_lead ? " ★" : "")).join(", ")} · พิมพ์ @ชื่อ เพื่อเอ่ยถึง แล้วกด “สั่งงานให้…” ใต้ข้อความเพื่อมอบหมายเป็นงานสั่ง</p>
      </div>
    );
  }

  let q = supabase.from("work_tasks").select(TASK_SELECT).eq("room_id", r.id);
  q = history ? q.in("status", ["accepted", "cancelled"]).order("reviewed_at", { ascending: false }).limit(200)
              : q.not("status", "in", "(accepted,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (who) q = q.eq("assignee_id", who);
  const { data } = await q;
  const tasks = fillEmployees(data as Task[], dir, "assignee_id");

  return (
    <div className="space-y-6">
      <Header crumbs={WORK} title={r.name} sub={r.description ?? undefined} action={<Link href={`/work/tasks/new?room=${r.key}`} className="btn-primary"><Plus size={16} /> สั่งงานในห้องนี้</Link>} />
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบงานแล้ว</div>}
      <RoomTabs roomKey={key} tab={tab} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1 text-ink-soft"><Users size={14} /></span>
        <Link href={`/work/rooms/${key}${history ? "?history=1" : ""}`} className={!who ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>ทุกคน</Link>
        {mem.map((m) => (
          <span key={m.employee_id} className="inline-flex items-center">
            <Link href={`/work/rooms/${key}?who=${m.employee_id}${history ? "&history=1" : ""}`} className={who === m.employee_id ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>
              {m.employees?.nickname ?? m.employees?.first_name}{m.is_lead && " ★"}
            </Link>
            {session.isAdmin && <form action={setRoomMember.bind(null, r.id, m.employee_id, true, !m.is_lead)}><button className={`ml-0.5 h-6 w-6 rounded-full text-xs grid place-items-center ${m.is_lead ? "text-yellow bg-yellow/20" : "text-ink-soft/40 hover:text-yellow"}`} title={m.is_lead ? "ถอดจากหัวหน้าห้อง" : "ตั้งเป็นหัวหน้าห้อง (โอน/แก้งานของทุกคนในห้องได้)"}>★</button></form>}
          </span>
        ))}
        <span className="ml-auto flex gap-2">
          <Link href={`/work/rooms/${key}${who ? `?who=${who}` : ""}`} className={!history ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>ค้างอยู่</Link>
          <Link href={`/work/rooms/${key}?history=1${who ? `&who=${who}` : ""}`} className={history ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>เสร็จแล้ว</Link>
        </span>
      </div>

      {history ? (
        <div className="space-y-2">{tasks.map((t) => <TaskCard key={t.id} t={t} showRoom={false} />)}{!tasks.length && <div className="card p-6 text-center text-ink-soft text-sm">ยังไม่มีงานที่เสร็จ</div>}</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const list = tasks.filter((t) => t.status === col);
            return (
              <div key={col} className="rounded-2xl bg-white/60 border border-line p-3 min-h-40">
                <div className="flex items-center justify-between mb-2 px-1"><span className="font-semibold text-sm">{STATUS_TH[col]}</span><span className="text-xs text-ink-soft">{list.length}</span></div>
                <div className="space-y-2">{list.map((t) => <TaskCard key={t.id} t={t} showRoom={false} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoomTabs({ roomKey, tab }: { roomKey: string; tab: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/work/rooms/${roomKey}`} className={tab !== "chat" ? "btn-primary py-1.5 px-4" : "btn-outline py-1.5 px-4"}><ListChecks size={16} /> งาน</Link>
      <Link href={`/work/rooms/${roomKey}?tab=chat`} className={tab === "chat" ? "btn-primary py-1.5 px-4" : "btn-outline py-1.5 px-4"}><MessageCircle size={16} /> แชทห้อง</Link>
      {roomKey === "sw-room" && <Link href="/work/deliveries" className="btn-outline py-1.5 px-4"><Truck size={16} /> ตารางส่งห้าง</Link>}
    </div>
  );
}
