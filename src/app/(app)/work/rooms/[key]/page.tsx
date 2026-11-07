import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { TaskCard } from "@/components/work/TaskCard";
import { TASK_SELECT, ensureRoutines } from "@/lib/work/queries";
import { STATUS_TH, type Room, type RoomMember, type Task, type TaskStatus } from "@/lib/work/types";

export const dynamic = "force-dynamic";
const COLUMNS: TaskStatus[] = ["open", "in_progress", "returned", "done"];

export default async function RoomPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ who?: string; history?: string; deleted?: string }> }) {
  const { key } = await params;
  const { who = "", history, deleted } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  await ensureRoutines(supabase);

  const { data: room } = await supabase.from("work_rooms").select("*").eq("key", key).maybeSingle();
  if (!room) notFound();
  const r = room as Room;
  const { data: members } = await supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", r.id);
  const mem = (members ?? []) as RoomMember[];
  if (!session.isAdmin && !mem.some((m) => m.employee_id === session.employee?.id)) redirect("/work?denied=1");

  let q = supabase.from("work_tasks").select(TASK_SELECT).eq("room_id", r.id);
  q = history ? q.in("status", ["accepted", "cancelled"]).order("reviewed_at", { ascending: false }).limit(200)
              : q.not("status", "in", "(accepted,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500);
  if (who) q = q.eq("assignee_id", who);
  const { data } = await q;
  const tasks = (data ?? []) as Task[];

  return (
    <div className="space-y-6">
      <Header title={r.name} sub={r.description ?? undefined} action={<Link href={`/work/tasks/new?room=${r.key}`} className="btn-primary"><Plus size={16} /> สั่งงานในห้องนี้</Link>} />
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบงานแล้ว</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1 text-ink-soft"><Users size={14} /></span>
        <Link href={`/work/rooms/${key}${history ? "?history=1" : ""}`} className={!who ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>ทุกคน</Link>
        {mem.map((m) => (
          <Link key={m.employee_id} href={`/work/rooms/${key}?who=${m.employee_id}${history ? "&history=1" : ""}`} className={who === m.employee_id ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>
            {m.employees?.nickname ?? m.employees?.first_name}{m.is_lead && " ★"}
          </Link>
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
