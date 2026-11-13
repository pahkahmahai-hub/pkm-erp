import { SwDeadlineStrip } from "@/components/work/TaskCard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, Repeat, Trash2, CalendarDays } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime, todayBkk } from "@/lib/format";
import { TASK_SELECT, loadDirectory, fillEmployees, roomRights } from "@/lib/work/queries";
import { STATUS_BADGE, STATUS_TH, statusLabel, type TaskStatus, type Task, type Checklist, type Comment, type RoomMember, type TaskFile, type Topic, effectiveDue } from "@/lib/work/types";
import { setTaskStatus, updateTask, deleteTask, toggleChecklist, addChecklistItem, deleteChecklistItem, addTaskFiles, deleteTaskFile } from "../../actions";
import { Storyboard } from "./Storyboard";
import { Thread } from "./Thread";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; error?: string; edit?: string }> }) {
  const { id } = await params;
  const { created, saved, error, edit } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [tRes, { data: checklist }, { data: comments }, { data: filesRaw }] = await Promise.all([
    supabase.from("work_tasks").select(TASK_SELECT + ", work_topics(id, name, color)").eq("id", id).maybeSingle(),
    supabase.from("work_checklist").select("*").eq("task_id", id).order("sort_order"),
    supabase.from("work_comments").select("*, app_users(display_name, email)").eq("task_id", id).order("created_at"),
    supabase.from("work_task_files").select("*").eq("task_id", id).order("sort_order").order("created_at"),
  ]);
  const t = tRes.error ? (await supabase.from("work_tasks").select(TASK_SELECT).eq("id", id).maybeSingle()).data : tRes.data;   // ก่อนรัน 0018
  if (!t) notFound();
  const task = t as unknown as Task;
  const files = (filesRaw ?? []) as TaskFile[];
  const hasCalendar = !tRes.error;
  const [{ data: membersRaw }, dir, { data: topicsRaw }] = await Promise.all([supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", task.room_id), loadDirectory(supabase), hasCalendar ? supabase.from("work_topics").select("*").eq("room_id", task.room_id).eq("is_active", true).order("sort_order") : Promise.resolve({ data: [] })]);
  const topics = (topicsRaw ?? []) as Topic[];
  const members = fillEmployees(membersRaw as RoomMember[], dir, "employee_id");
  if (!task.employees && task.assignee_id) task.employees = dir.find((e) => e.id === task.assignee_id) ?? null;
  const mem = (members ?? []) as RoomMember[];

  const me = session.appUser.id;
  const myEmp = session.employee?.id;
  // ผู้บริหาร / ผู้สั่งงาน / หัวหน้าห้อง (★) แก้ไข โอนงาน ตรวจรับ และลบได้
  const isLead = (await roomRights(supabase, task.room_id, session.isAdmin)).isLead || (!!session.employee && members.some((m) => m.employee_id === session.employee!.id && m.is_lead));
  const isAssignee = task.assignee_id === myEmp;
  const isOwner = session.isAdmin || task.created_by === me || isLead;
  // ตรวจรับ/ตีกลับ: งานของตัวเองต้องให้ผู้บริหาร (งานของหัวหน้าห้อง = ผม/ภรรยาอนุมัติ)
  const canReview = session.isAdmin || (isOwner && !isAssignee);
  // SW ROOM: ขั้นส่งห้างต่อจากตรวจรับ — เฉพาะหัวหน้าห้อง SW (★) และผู้บริหาร
  const isSw = task.work_rooms?.key === "sw-room";
  const canStage = session.isAdmin || isLead;
  const overdue = (() => { const d = effectiveDue(task); return !!d && d < todayBkk() && !["accepted", "cancelled", "done"].includes(task.status); })();
  const items = (checklist ?? []) as Checklist[];
  const doneCount = items.filter((c) => c.is_done).length;

  return (
    <div className="space-y-6">
      <Header crumbs={[{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${task.work_rooms?.key}`, label: task.work_rooms?.name ?? "ห้อง" }]} title={`#${task.task_no} ${task.title}`} sub={`สั่งโดย ${task.app_users?.display_name ?? "—"} · ${fmtDateTime(task.created_at)}`} action={<span className={`${STATUS_BADGE[task.status]} text-sm px-3 py-1`}>{statusLabel(task.status, task.work_rooms?.key)}</span>} />
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
              {isSw && <div><label className="label">② กำหนดส่งถึงห้าง</label><input name="arrive_due" type="date" defaultValue={task.arrive_due ?? ""} className="input" /></div>}
              <div><label className="label">{isSw ? "① กำหนดจัดของเสร็จ" : "กำหนดเสร็จ"}</label><div className="flex gap-2"><input name="due_date" type="date" defaultValue={task.due_date ?? ""} className="input" />{hasCalendar && <input name="due_time" type="time" defaultValue={task.due_time?.slice(0, 5) ?? "17:30"} className="input w-28" />}</div></div>
              {hasCalendar && <><div><label className="label">วันเริ่ม / วันที่ลงปฏิทิน</label><input name="start_date" type="date" defaultValue={task.start_date ?? ""} className="input" /></div>
                <div><label className="label">หัวข้อ Routine</label><select name="topic_id" defaultValue={task.topic_id ?? ""} className="input"><option value="">—</option>{topics.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}{tp.employee_id ? "" : " (ห้อง)"}</option>)}</select></div></>}
              <div className="md:col-span-2 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="priority" value="normal" defaultChecked={task.priority === "normal"} className="accent-purple" /> ปกติ</label><label className="flex items-center gap-2"><input type="radio" name="priority" value="urgent" defaultChecked={task.priority === "urgent"} className="accent-purple" /> 🔥 ด่วน</label></div>
              <div className="md:col-span-2 flex gap-2"><button className="btn-primary">บันทึก</button><Link href={`/work/tasks/${id}`} className="btn-ghost">ยกเลิก</Link></div>
            </form>
          ) : (
            <div className="card p-5 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div><span className="text-ink-soft">ผู้รับ:</span> <b>{task.employees ? (task.employees.nickname ?? task.employees.first_name) : "ยังไม่มอบหมาย"}</b></div>
                {!isSw && <div><span className="text-ink-soft">กำหนดเสร็จ:</span> <b className={overdue ? "text-red" : ""}>{task.due_date ? fmtDate(task.due_date, { weekday: "short" }) : "—"}{task.due_time ? " " + task.due_time.slice(0, 5) + " น." : ""}{overdue && " (เลยกำหนด)"}</b></div>}
                {task.start_date && <div className="flex items-center gap-1"><CalendarDays size={14} className="text-ink-soft" /><span className="text-ink-soft">ลงปฏิทิน:</span> <b>{fmtDate(task.start_date, { weekday: "short" })}</b></div>}
                {task.work_topics && <div><span className="rounded-md px-2 py-0.5 text-xs font-semibold border" style={{ borderColor: task.work_topics.color, color: task.work_topics.color }}>{task.work_topics.name}</span></div>}
                {task.priority === "urgent" && <div className="text-red font-semibold flex items-center gap-1"><Flame size={14} /> ด่วน</div>}
                {task.routine_id && <div className="text-ink-soft flex items-center gap-1"><Repeat size={14} /> งานประจำ</div>}
              </div>
              {isSw && !["accepted", "cancelled"].includes(task.status) && (
                <div><div className="text-xs text-ink-soft mb-1">กำหนด 3 ระยะ — ช่องสีเข้ม = ระยะที่ต้องตามตอนนี้ (แดง = เลยกำหนด · ~ = คาดการณ์ นับ 7 วันจริงเมื่อกด “สินค้าถึงแล้ว”)</div><SwDeadlineStrip t={task} size="md" /></div>
              )}
              {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
              {task.done_note && <div className="text-sm rounded-xl bg-teal/10 px-3 py-2"><b>บันทึกตอนส่งงาน:</b> {task.done_note}</div>}
              {task.review_note && <div className="text-sm rounded-xl bg-red/10 px-3 py-2"><b>หมายเหตุจากผู้ตรวจ:</b> {task.review_note}</div>}
              {isOwner && <div className="flex gap-3 text-xs"><Link href={`/work/tasks/${id}?edit=1`} className="text-purple font-semibold">แก้ไขรายละเอียด</Link></div>}
            </div>
          )}

          {/* checklist */}
          {hasCalendar && <Storyboard taskId={id} files={files} canEdit={isOwner || isAssignee} addAction={addTaskFiles.bind(null, id, task.room_id)} deleteAction={deleteTaskFile} />}
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
            {canReview && task.status === "done" && (
              <form className="space-y-2">
                <input name="note" className="input" placeholder="หมายเหตุ (ถ้ามี)" />
                <div className="grid grid-cols-2 gap-2">
                  {isSw && canStage
                    ? <button formAction={setTaskStatus.bind(null, id, "prep")} className="btn-primary">อนุมัติ → เตรียมส่ง</button>
                    : <button formAction={setTaskStatus.bind(null, id, "accepted")} className="btn-primary">ตรวจรับ</button>}
                  <button formAction={setTaskStatus.bind(null, id, "returned")} className="btn-danger">ตีกลับ</button>
                </div>
                {isSw && !canStage && <p className="text-[11px] text-ink-soft">ขั้นส่งห้าง (เตรียมส่ง → ส่งแล้ว → ถึงแล้ว → อัพเข้าระบบ) กดได้โดยหัวหน้าห้อง SW และผู้บริหาร</p>}
              </form>
            )}
            {isSw && canStage && ["prep", "shipped", "arrived"].includes(task.status) && (
              <form className="space-y-2">
                <div className="flex items-center gap-1 text-[11px] text-ink-soft flex-wrap">{(["prep", "shipped", "arrived", "accepted"] as TaskStatus[]).map((s, i) => <span key={s} className={`rounded-full px-2 py-0.5 ${task.status === s ? "bg-purple text-white font-semibold" : (["prep", "shipped", "arrived", "accepted"].indexOf(task.status) > i ? "bg-green/15 text-green" : "bg-cream")}`}>{i + 1}. {statusLabel(s, "sw-room")}</span>)}</div>
                <input name="note" className="input" placeholder="หมายเหตุ (ถ้ามี) เช่น เลขพัสดุ / ผู้รับ" />
                {task.status === "prep" && <button formAction={setTaskStatus.bind(null, id, "shipped")} className="btn-primary w-full">🚚 ส่งสินค้าแล้ว</button>}
                {task.status === "shipped" && <button formAction={setTaskStatus.bind(null, id, "arrived")} className="btn-primary w-full">📦 สินค้าถึงห้างแล้ว</button>}
                {task.status === "arrived" && <button formAction={setTaskStatus.bind(null, id, "accepted")} className="btn-primary w-full">✔ อัพเข้าระบบเรียบร้อย — ปิดงาน</button>}
              </form>
            )}
            {isOwner && !["accepted", "cancelled"].includes(task.status) && (
              <form action={setTaskStatus.bind(null, id, "cancelled")}><button className="btn-ghost w-full text-ink-soft">ยกเลิกงาน</button></form>
            )}
            {isOwner && task.status === "accepted" && (
              <form action={setTaskStatus.bind(null, id, "open")}><button className="btn-ghost w-full text-ink-soft">เปิดงานอีกครั้ง</button></form>
            )}
            {task.status === "accepted" && <div className="text-sm text-green font-semibold text-center">{isSw ? "เข้าระบบเรียบร้อย" : "เสร็จสิ้น"} ✔ {task.reviewed_at && fmtDate(task.reviewed_at)}</div>}
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
