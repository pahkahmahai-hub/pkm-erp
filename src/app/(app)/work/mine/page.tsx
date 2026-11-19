import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { TaskCard } from "@/components/work/TaskCard";
import { TASK_SELECT, loadDirectory, fillEmployees, isFutureRoutine } from "@/lib/work/queries";
import type { Task, TaskStatus } from "@/lib/work/types";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

type Role = "assignee" | "co" | "checklist" | "mention";
const ROLE_LABEL: Record<Role, string> = { assignee: "ผู้รับงาน", co: "ผู้ร่วมงาน", checklist: "เช็คลิสต์", mention: "ถูก @" };
// คอลัมน์ของบอร์ด (งานส่งห้าง prep/shipped/arrived รวมไว้ที่ "รอตรวจรับ / ส่งห้าง")
const COLS: { id: string; label: string; has: TaskStatus[] }[] = [
  { id: "open", label: "ใหม่", has: ["open"] },
  { id: "in_progress", label: "กำลังทำ", has: ["in_progress"] },
  { id: "returned", label: "ตีกลับ", has: ["returned"] },
  { id: "done", label: "รอตรวจรับ / ส่งห้าง", has: ["done", "prep", "shipped", "arrived"] as TaskStatus[] },
];

export default async function MyRelatedPage({ searchParams }: { searchParams: Promise<{ history?: string; role?: string }> }) {
  const { history: h, role } = await searchParams;
  const history = h === "1";
  await getSession();
  const supabase = await createClient();
  const { data: rel, error } = await supabase.rpc("my_related_tasks", { p_history: history });
  const roles = new Map(((rel ?? []) as { task_id: string; roles: Role[] }[]).map((r) => [r.task_id, r.roles]));
  const ids = [...roles.keys()];
  const [{ data }, dir] = await Promise.all([
    ids.length ? supabase.from("work_tasks").select(TASK_SELECT).in("id", ids).order("due_date", { ascending: true, nullsFirst: false }) : Promise.resolve({ data: [] }),
    loadDirectory(supabase),
  ]);
  let tasks = fillEmployees((data ?? []) as Task[], dir, "assignee_id").filter((t) => history || !isFutureRoutine(t));
  const count = (r: Role) => tasks.filter((t) => roles.get(t.id)?.includes(r)).length;
  if (role && role in ROLE_LABEL) tasks = tasks.filter((t) => roles.get(t.id)?.includes(role as Role));
  const note = (t: Task) => (roles.get(t.id) ?? []).map((r) => ROLE_LABEL[r]).join(" · ");
  const qs = (p: { history?: boolean; role?: string | null }) => { const u = new URLSearchParams(); if (p.history ?? history) u.set("history", "1"); const r = p.role === undefined ? role : p.role; if (r) u.set("role", r); const s = u.toString(); return `/work/mine${s ? `?${s}` : ""}`; };
  const chip = (on: boolean) => on ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs";

  return (
    <div className="space-y-6">
      <Header crumbs={WORK} title="งานที่เกี่ยวกับฉัน" sub="ทุกห้อง — งานที่ฉันเป็นผู้รับ/ผู้ร่วม · มีข้อในเช็คลิสต์ · หรือถูก @ ในคอมเมนต์" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error.message.includes("my_related_tasks") ? "ยังไม่ได้รัน SQL 0071" : error.message}</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={qs({ role: null })} className={chip(!role)}>ทั้งหมด</Link>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <Link key={r} href={qs({ role: r })} className={chip(role === r)}>{ROLE_LABEL[r]}{!role && count(r) > 0 ? ` (${count(r)})` : ""}</Link>)}
        <span className="ml-auto flex gap-2">
          <Link href={qs({ history: false })} className={chip(!history)}>ค้างอยู่</Link>
          <Link href={qs({ history: true })} className={chip(history)}>เสร็จแล้ว (30 วัน)</Link>
        </span>
      </div>
      {history ? (
        <div className="space-y-2">{tasks.map((t) => <TaskCard key={t.id} t={t} note={note(t)} />)}{!tasks.length && <div className="card p-6 text-center text-ink-soft text-sm">ยังไม่มีงานที่เสร็จใน 30 วัน</div>}</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLS.map((c) => {
            const list = tasks.filter((t) => c.has.includes(t.status));
            return (
              <div key={c.id} className="rounded-2xl border border-line bg-white/60 p-3 min-h-40">
                <div className="flex items-center justify-between mb-2 px-1"><span className="font-semibold text-sm">{c.label}</span><span className="text-xs text-ink-soft">{list.length}</span></div>
                <div className="space-y-2">{list.map((t) => <TaskCard key={t.id} t={t} note={note(t)} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
