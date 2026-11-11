import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, Repeat, Trash2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime, todayBkk } from "@/lib/format";
import { TASK_SELECT, loadDirectory, fillEmployees } from "@/lib/work/queries";
import { STATUS_BADGE, STATUS_TH, type Task, type Checklist, type Comment, type RoomMember } from "@/lib/work/types";
import { setTaskStatus, updateTask, deleteTask, toggleChecklist, addChecklistItem, deleteChecklistItem } from "../../actions";
import { Thread } from "./Thread";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; error?: string; edit?: string }> }) {
  const { id } = await params;
  const { created, saved, error, edit } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: t }, { data: checklist }, { data: comments }] = await Promise.all([
    supabase.from("work_tasks").select(TASK_SELECT).eq("id", id).maybeSingle(),
    supabase.from("work_checklist").select("*").eq("task_id", id).order("sort_order"),
    supabase.from("work_comments").select("*, app_users(display_name, email)").eq("task_id", id).order("created_at"),
  ]);
  if (!t) notFound();
  const task = t as Task;
  const [{ data: membersRaw }, dir] = await Promise.all([supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", task.room_id), loadDirectory(supabase)]);
  const members = fillEmployees(membersRaw as RoomMember[], dir, "employee_id");
  if (!task.employees && task.assignee_id) task.employees = dir.find((e) => e.id === task.assignee_id) ?? null;
  const mem = (members ?? []) as RoomMember[];

  const me = session.appUser.id;
  const myEmp = session.employee?.id;
  const isOwner = session.isAdmin || task.created_by === me;
  const isAssignee = task.assignee_id === myEmp;
  const overdue = !!task.due_date && task.due_date < todayBkk() && !["accepted", "cancelled", "done"].includes(task.status);
  const items = (checklist ?? []) as Checklist[];
  const doneCount = items.filter((c) => c.is_done).length;

  return (
    <div className="space-y-6">
      <Header crumbs={[{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${task.work_rooms?.key}`, label: task.work_rooms?.name ?? "ห้อง" }]} title={`#${task.task_no} ${task.title}`} sub={`สั่งโดย ${task.app_users?.display_name ?? "—"} · ${fmtDateTime(task.created_at)}`} action={<span className={`${STATUS_BADGE[task.status]} text-sm px-3 py-1`}>{STATUS_TH[task.status]}</span>} />
      {created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">สั่งงานแล้ว ผู้รับจะเห็นในหน้างานของตัวเอง</div>}
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          {/* details / edit */}
          {edit && isOwner ? (
            <form action={updateTask.bind(null, id)} className="card p-5 grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><label className="label">ชื่องาน</label><input name="title" defaultValue={task.title} className="input" required /></div>
              <div className="md:col-span-2"><label className="label">รายละเอียด</label><textarea name="description" defaultValue={task.description ?? ""} className="input" rows={3} /></div>
              <div><label className="label">มอบหมายให้</label>
                <select name="assignee_id" defaultValue={task.assignee_id ?? ""} className="input"><option value="">—</option>{mem.map((m) => <option key={m.employee_id} value={m.employee_id}>{m.employees?.nickname ?? m.employees?.first_name}</option>)}</select></div>
              <div><label className="label">กำหนดเสร็จ</label><input name="due_date" type="date" defaultValue={task.due_date ?? ""} className="input" /></div>
              <div className="md:col-span-2 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="priority" value="normal" defaultChecked={task.priority === "normal"} className="accent-purple" /> ปกติ</label><label className="flex items-center gap-2"><input type="radio" name="priority" value="urgent" defaultChecked={task.priority === "urgent"} className="accent-purple" /> 🔥 ด่วน</label></div>
              <div className="md:col-span-2 flex gap-2"><button className="btn-primary">บันทึก</button><Link href={`/work/tasks/${id}`} className="btn-ghost">ยกเลิก</Link></div>
            </form>
          ) : (
            <div className="card p-5 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div><span className="text-ink-soft">ผู้รับ:</span> <b>{task.employees ? (task.employees.nickname ?? task.employees.first_name) : "ยังไม่มอบหมาย"}</b></div>
                <div><span className="text-ink-soft">กำหนดเสร็จ:</span> <b className={overdue ? "text-red" : ""}>{task.due_date ? fmtDate(task.due_date, { weekday: "short" }) : "—"}{overdue && " (เลยกำหนด)"}</b></div>
                {task.priority === "urgent" && <div className="text-red font-semibold flex items-center gap-1"><Flame size={14} /> ด่วน</div>}
                {task.routine_id && <div className="text-ink-soft flex items-center gap-1"><Repeat size={14} /> งานประจำ</div>}
              </div>
              {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
              {task.done_note && <div className="text-sm rounded-xl bg-teal/10 px-3 py-2"><b>บันทึกตอนส่งงาน:</b> {task.done_note}</div>}
              {task.review_note && <div className="text-sm rounded-xl bg-red/10 px-3 py-2"><b>หมายเหตุจากผู้ตรวจ:</b> {task.review_note}</div>}
              {isOwner && <div className="flex gap-3 text-xs"><Link href={`/work/tasks/${id}?edit=1`} className="text-purple font-semibold">แก้ไขรายละเอียด</Link></div>}
            </div>
          )}

          {/* checklist */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-2"><h2 className="font-display font-bold">เช็คลิสต์</h2>{items.length > 0 && <span className="text-xs text-ink-soft">{doneCount}/{items.length}</span>}</div>
            {items.length > 0 && <div className="h-1.5 rounded-full bg-lavender/40 mb-3"><div className="h-full rounded-full bg-teal" style={{ width: `${(doneCount / items.length) * 100}%` }} /></div>}
            <ul className="space-y-1.5">
              {items.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <form action={toggleChecklist.bind(null, c.id, id, !c.is_done)}><button className={`h-5 w-5 rounded border grid place-items-center ${c.is_done ? "bg-teal border-teal text-white" : "border-line"}`}>{c.is_done ? "✓" : ""}</button></form>
                  <span className={c.is_done ? "line-through text-ink-soft" : ""}>{c.label}</span>
                  {isOwner && <form action={deleteChecklistItem.bind(null, c.id, id)} className="ml-auto"><button className="text-ink-soft hover:text-red"><Trash2 size={13} /></button></form>}
                </li>
              ))}
            </ul>
            <form action={addChecklistItem.bind(null, id)} className="flex gap-2 mt-3"><input name="label" className="input" placeholder="+ เพิ่มข้อ" /><button className="btn-outline whitespace-nowrap">เพิ่ม</button></form>
          </div>

          {/* thread */}
          <Thread taskId={id} initial={(comments ?? []) as Comment[]} meId={me} />
        </div>

        {/* actions */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="font-display font-bold">ดำเนินการ</h2>
            {(isAssignee || isOwner) && (task.status === "open" || task.status === "returned") && (
              <form action={setTaskStatus.bind(null, id, "in_progress")}><button className="btn-outline w-full">เริ่มทำงาน</button></form>
            )}
            {(isAssignee || isOwner) && ["open", "in_progress", "returned"].includes(task.status) && (
              <form action={setTaskStatus.bind(null, id, "done")} className="space-y-2">
                <input name="note" className="input" placeholder="บันทึกตอนส่งงาน (ถ้ามี)" />
                <button className="btn-primary w-full">✔ ทำเสร็จแล้ว ส่งตรวจ</button>
                <p className="text-[11px] text-ink-soft">แนบรูปผลงานได้ในช่องคอมเมนต์ด้านซ้าย</p>
              </form>
            )}
            {isOwner && task.status === "done" && (
              <form className="space-y-2">
                <input name="note" className="input" placeholder="หมายเหตุ (ถ้ามี)" />
                <div className="grid grid-cols-2 gap-2">
                  <button formAction={setTaskStatus.bind(null, id, "accepted")} className="btn-primary">ตรวจรับ</button>
                  <button formAction={setTaskStatus.bind(null, id, "returned")} className="btn-danger">ตีกลับ</button>
                </div>
              </form>
            )}
            {isOwner && !["accepted", "cancelled"].includes(task.status) && (
              <form action={setTaskStatus.bind(null, id, "cancelled")}><button className="btn-ghost w-full text-ink-soft">ยกเลิกงาน</button></form>
            )}
            {isOwner && task.status === "accepted" && (
              <form action={setTaskStatus.bind(null, id, "open")}><button className="btn-ghost w-full text-ink-soft">เปิดงานอีกครั้ง</button></form>
            )}
            {task.status === "accepted" && <div className="text-sm text-green font-semibold text-center">เสร็จสิ้น ✔ {task.reviewed_at && fmtDate(task.reviewed_at)}</div>}
          </div>

          <div className="card p-5 text-xs text-ink-soft space-y-1">
            <div>สร้าง: {fmtDateTime(task.created_at)}</div>
            {task.started_at && <div>เริ่มทำ: {fmtDateTime(task.started_at)}</div>}
            {task.done_at && <div>ส่งงาน: {fmtDateTime(task.done_at)}</div>}
            {task.reviewed_at && <div>ตรวจ: {fmtDateTime(task.reviewed_at)}</div>}
          </div>

          {isOwner && <ConfirmDelete action={deleteTask.bind(null, id, task.work_rooms?.key ?? "teamwork")} label="ลบงาน" warning="ลบงานนี้พร้อมคอมเมนต์และไฟล์ทั้งหมด กู้คืนไม่ได้ — ถ้าแค่ไม่ทำแล้วให้กด 'ยกเลิกงาน' แทน" />}
        </div>
      </div>
    </div>
  );
}
