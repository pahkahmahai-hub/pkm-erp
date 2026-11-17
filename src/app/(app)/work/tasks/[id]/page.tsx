import { CoAssigneePicker } from "@/components/work/CoAssigneePicker";
import { SwDeadlineStrip } from "@/components/work/TaskCard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, Repeat, Trash2, CalendarDays, ChevronUp, ChevronDown, Pencil } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtDateShort, todayBkk } from "@/lib/format";
import { TASK_SELECT, loadDirectory, fillEmployees, roomRights, roomFamilyIds, userNames } from "@/lib/work/queries";
import { STATUS_BADGE, STATUS_TH, statusLabel, type TaskStatus, type Task, type Checklist, type Comment, type RoomMember, type TaskFile, type Topic, effectiveDue } from "@/lib/work/types";
import { swStepBack, setTaskStatus, updateTask, deleteTask, toggleChecklist, addChecklistItem, deleteChecklistItem, updateChecklistItem, moveChecklistItem, addTaskFiles, deleteTaskFile, markTaskNotificationsRead, markTaskRead, renameTask, forwardTask, decideForward, requestPostpone, decidePostpone } from "../../actions";
import { Storyboard } from "./Storyboard";
import { Thread } from "./Thread";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { DateInput } from "@/components/DateInput";
import { WorkTypeFields } from "@/components/work/WorkTypeFields";
import { GC_ROOM_KEYS, unitOf } from "@/lib/work/workType";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; error?: string; edit?: string; fwd?: string; pp?: string }> }) {
  const { id } = await params;
  const { created, saved, error, edit, fwd, pp } = await searchParams;
  const session = await getSession();
  await markTaskNotificationsRead(id).catch(() => {});
  await markTaskRead(id).catch(() => {});
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
  const [{ data: membersRaw }, dir, { data: topicsRaw }] = await Promise.all([supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", task.room_id), loadDirectory(supabase), hasCalendar ? roomFamilyIds(supabase, task.room_id).then((ids) => supabase.from("work_topics").select("*").in("room_id", ids).eq("is_active", true).order("sort_order")) : Promise.resolve({ data: [] })]);
  const topics = (topicsRaw ?? []) as Topic[];
  const members = fillEmployees(membersRaw as RoomMember[], dir, "employee_id");
  if (!task.employees && task.assignee_id) task.employees = dir.find((e) => e.id === task.assignee_id) ?? null;
  const mem = (members ?? []) as RoomMember[];

  const me = session.appUser.id;
  const myEmp = session.employee?.id;
  // ผู้บริหาร / ผู้สั่งงาน / หัวหน้าห้อง (★) แก้ไข โอนงาน ตรวจรับ และลบได้
  const isLead = (await roomRights(supabase, task.room_id, session.isAdmin)).isLead || (!!session.employee && members.some((m) => m.employee_id === session.employee!.id && m.is_lead));
  const isAssignee = task.assignee_id === myEmp || (!!myEmp && (task.co_assignee_ids ?? []).includes(myEmp));
  const coNames = (task.co_assignee_ids ?? []).filter((x) => x !== task.assignee_id).map((x) => { const e = dir.find((d) => d.id === x); return e ? e.nickname ?? e.first_name : "?"; });
  const isOwner = session.isAdmin || task.created_by === me || isLead;
  // ตรวจรับ/ตีกลับ: งานของตัวเองต้องให้ผู้บริหาร (งานของหัวหน้าห้อง = ผม/ภรรยาอนุมัติ)
  const canReview = session.isAdmin || (isOwner && !isAssignee);
  // SW ROOM: ขั้นส่งห้างต่อจากตรวจรับ — เฉพาะหัวหน้าห้อง SW (★) และผู้บริหาร
  const isSw = task.work_rooms?.key === "sw-room";
  const canStage = session.isAdmin || isLead;
  const overdue = (() => { const d = effectiveDue(task); return !!d && d < todayBkk() && !["accepted", "cancelled", "done"].includes(task.status); })();
  const items = (checklist ?? []) as Checklist[];
  // ผู้รับผิดชอบรายข้อ: ทุกคนในบริษัท (คนในห้องขึ้นก่อน) — งานบางขั้นเกี่ยวกับแผนกอื่น
  const memIds = new Set(mem.map((m) => m.employee_id));
  const { data: adminRows } = await supabase.rpc("mentionable_admins");
  const admins = (adminRows ?? []) as { user_id: string; employee_id: string | null; label: string }[];
  const people = [...admins.filter((a) => !a.employee_id).map((a) => ({ id: `u:${a.user_id}`, name: `${a.label} (ผู้บริหาร)` })), ...mem.map((m) => ({ id: m.employee_id, name: m.employees?.nickname ?? m.employees?.first_name ?? "?" })), ...dir.filter((e) => !memIds.has(e.id)).map((e) => ({ id: e.id, name: `${e.nickname ?? e.first_name} (แผนกอื่น)` }))];
  // @ ในคอมเมนต์: คนในห้อง + ผู้รับงาน/ผู้ร่วมงาน + ผู้รับผิดชอบรายข้อ + ผู้บริหาร
  const involved = new Set<string>([...mem.map((m) => m.employee_id), ...(task.assignee_id ? [task.assignee_id] : []), ...(task.co_assignee_ids ?? []), ...items.map((c) => c.assignee_id).filter((x): x is string => !!x)]);
  admins.forEach((a) => { if (a.employee_id) involved.add(a.employee_id); });
  const mentionMembers = [
    ...[...involved].map((eid) => dir.find((e) => e.id === eid)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({ employee_id: e.id, label: (e.nickname ?? e.first_name).replace(/\s+/g, ""), first_name: e.first_name })),
    ...admins.filter((a) => !a.employee_id).map((a) => ({ employee_id: a.user_id, label: a.label.split(/\s+/)[0], first_name: "ผู้บริหาร", isUser: true })),
  ];
  const asgVal = (c: Checklist) => (c.assignee_user_id ? `u:${c.assignee_user_id}` : c.assignee_id ?? "");
  const asgName = (c: Checklist) => (c.assignee_user_id ? admins.find((a) => a.user_id === c.assignee_user_id)?.label ?? "ผู้บริหาร" : c.assignee_id ? nameOf(c.assignee_id) : "");
  const asgMe = (c: Checklist) => (c.assignee_user_id ? c.assignee_user_id === me : !!myEmp && c.assignee_id === myEmp);
  const nameOf = (empId: string) => { const e = dir.find((d) => d.id === empId); return e ? e.nickname ?? e.first_name : ""; };
  const todayTH = todayBkk();
  const doneCount = items.filter((c) => c.is_done).length;

  return (
    <div className="space-y-6">
      <Header crumbs={[{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${task.work_rooms?.key}`, label: task.work_rooms?.name ?? "ห้อง" }]} title={`#${task.task_no} ${task.title}`} sub={`สั่งโดย ${task.app_users?.display_name ?? "—"} · ${fmtDateTime(task.created_at)}`} action={<span className="flex items-center gap-2">{isOwner && <details className="relative"><summary className="list-none cursor-pointer btn-outline !py-1 text-sm flex items-center gap-1"><Pencil size={14} /> แก้ชื่องาน</summary>
        <form action={renameTask.bind(null, id)} className="absolute right-0 z-20 mt-2 w-[min(90vw,520px)] card p-3 flex gap-2 shadow-lg"><input name="title" defaultValue={task.title} className="input" required autoFocus /><button className="btn-primary whitespace-nowrap">บันทึก</button></form></details>}
        <span className={`${STATUS_BADGE[task.status]} text-sm px-3 py-1`}>{statusLabel(task.status, task.work_rooms?.key)}</span></span>} />
      {created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">สั่งงานแล้ว ผู้รับจะเห็นในหน้างานของตัวเอง</div>}
      {pp === "sent" && <div className="rounded-xl bg-yellow/20 text-[#7a4a00] text-sm px-4 py-3">ส่งคำขอเลื่อนกำหนดแล้ว — รอหัวหน้า / ผู้บริหารอนุมัติ</div>}
      {fwd === "done" && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ส่งต่องานแล้ว — แจ้งเตือนคนรับใหม่และผู้สั่งงานให้แล้ว</div>}
      {fwd === "pending" && <div className="rounded-xl bg-yellow/20 text-[#7a4a00] text-sm px-4 py-3">ส่งคำขอส่งต่องานแล้ว — รอหัวหน้าห้องอนุมัติ</div>}
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
              <div className="md:col-span-2"><CoAssigneePicker options={mem.map((m) => ({ id: m.employee_id, name: m.employees?.nickname ?? m.employees?.first_name ?? "?" }))} defaultIds={task.co_assignee_ids ?? []} primaryId={task.assignee_id} /></div>
              {GC_ROOM_KEYS.includes(task.work_rooms?.key ?? "") && <WorkTypeFields defaultType={task.work_type} defaultQty={task.work_qty} />}
              {isSw && <div><label className="label">② กำหนดส่งถึงห้าง</label><DateInput name="arrive_due" defaultValue={task.arrive_due ?? ""} className="input" /></div>}
              <div><label className="label">{isSw ? "① กำหนดจัดของเสร็จ" : "กำหนดเสร็จ"}</label><div className="flex gap-2"><DateInput name="due_date" defaultValue={task.due_date ?? ""} className="input" />{hasCalendar && <input name="due_time" type="time" defaultValue={task.due_time?.slice(0, 5) ?? "17:30"} className="input w-28" />}</div></div>
              {hasCalendar && <><div><label className="label">วันเริ่ม / วันที่ลงปฏิทิน</label><DateInput name="start_date" defaultValue={task.start_date ?? ""} className="input" /></div>
                <div><label className="label">หัวข้อ Routine</label><select name="topic_id" defaultValue={task.topic_id ?? ""} className="input"><option value="">—</option>{topics.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}{tp.employee_id ? "" : " (ห้อง)"}</option>)}</select></div></>}
              <div className="md:col-span-2 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="priority" value="normal" defaultChecked={task.priority === "normal"} className="accent-purple" /> ปกติ</label><label className="flex items-center gap-2"><input type="radio" name="priority" value="urgent" defaultChecked={task.priority === "urgent"} className="accent-purple" /> 🔥 ด่วน</label></div>
              <div className="md:col-span-2 flex gap-2"><button className="btn-primary">บันทึก</button><Link href={`/work/tasks/${id}`} className="btn-ghost">ยกเลิก</Link></div>
            </form>
          ) : (
            <div className="card p-5 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {task.work_type && <div><span className="text-ink-soft">ประเภทงาน:</span> <span className="rounded-md bg-lavender/40 text-purple px-2 py-0.5 font-semibold">{task.work_type}{task.work_qty ? ` · ${task.work_qty} ${unitOf(task.work_type)}` : ""}</span></div>}
                <div><span className="text-ink-soft">ผู้รับ:</span> <b>{task.employees ? (task.employees.nickname ?? task.employees.first_name) : "ยังไม่มอบหมาย"}</b>{coNames.length > 0 && <span> + ผู้ร่วมงาน <b>{coNames.join(", ")}</b></span>}</div>
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
            {items.length > 0 && doneCount === items.length && !["accepted", "cancelled"].includes(task.status) && (() => {
              const selfTask = task.assignee_id === myEmp || (!!myEmp && (task.co_assignee_ids ?? []).includes(myEmp));
              const canClose = session.isAdmin || (isOwner && !selfTask);
              return (
                <div className="mb-3 rounded-xl bg-green/10 border border-green/30 p-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-green font-semibold">✅ ทำครบทุกข้อแล้ว</span>
                  {canClose
                    ? <form action={setTaskStatus.bind(null, id, "accepted")} className="ml-auto"><button className="btn-primary py-1.5">✔ เคลียร์จบงาน</button></form>
                    : isAssignee && task.status !== "done"
                      ? <form action={setTaskStatus.bind(null, id, "done")} className="ml-auto"><button className="btn-primary py-1.5">ส่งตรวจ · ปิดงาน</button></form>
                      : <span className="ml-auto text-xs text-ink-soft">รอผู้สั่งงาน / หัวหน้ากดปิดงาน</span>}
                </div>
              );
            })()}
            {items.length > 0 && <div className="h-1.5 rounded-full bg-lavender/40 mb-3"><div className="h-full rounded-full bg-teal" style={{ width: `${(doneCount / items.length) * 100}%` }} /></div>}
            <ul className="space-y-1.5">
              {items.map((c, ci) => (
                <li key={c.id} className="text-sm relative">
                  <div className="flex items-center gap-2">
                  <form action={toggleChecklist.bind(null, c.id, id, !c.is_done)}><button className={`h-5 w-5 rounded border grid place-items-center ${c.is_done ? "bg-teal border-teal text-white" : "border-line"}`}>{c.is_done ? "✓" : ""}</button></form>
                  <span className={c.is_done ? "line-through text-ink-soft" : ""}>{c.label}</span>
                  {c.due_date && (() => { const od = !c.is_done && c.due_date < todayTH; const td = !c.is_done && c.due_date === todayTH; return <span className={`text-[11px] rounded-md px-1.5 py-0.5 whitespace-nowrap ${c.is_done ? "text-ink-soft" : od ? "bg-red/10 text-red font-semibold" : td ? "bg-yellow/30 text-[#7a4a00] font-semibold" : "bg-lavender/30 text-purple"}`}>{od ? "เลยกำหนด " : td ? "วันนี้ " : ""}{fmtDateShort(c.due_date)}</span>; })()}
                  {(c.assignee_id || c.assignee_user_id) && <span className={`text-[11px] whitespace-nowrap ${asgMe(c) ? "text-purple font-semibold" : "text-ink-soft"}`}>· {asgName(c)}{asgMe(c) ? " (ฉัน)" : ""}</span>}
                  {(isOwner || isAssignee || asgMe(c)) && <details className="ml-auto group"><summary className="list-none cursor-pointer text-[11px] text-purple underline whitespace-nowrap">กำหนด</summary>
                    <form action={updateChecklistItem.bind(null, c.id, id)} className="absolute right-0 top-6 z-10 w-72 max-w-[85vw] card p-3 space-y-2 shadow-lg">
                      <div><label className="label">ข้อ</label><input name="label" defaultValue={c.label} className="input" /></div>
                      <div><label className="label">วันกำหนด</label><DateInput name="due_date" defaultValue={c.due_date ?? ""} className="input" /></div>
                      <div><label className="label">ผู้รับผิดชอบ (ไม่บังคับ)</label><select name="assignee_id" defaultValue={asgVal(c)} className="input"><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                      <button className="btn-primary w-full">บันทึก</button>
                    </form></details>}
                  {(isOwner || isAssignee) && <span className="flex flex-col -my-1">
                    <form action={moveChecklistItem.bind(null, c.id, id, -1)}><button disabled={ci === 0} title="เลื่อนขึ้น" className="text-ink-soft hover:text-purple disabled:opacity-20 leading-none"><ChevronUp size={14} /></button></form>
                    <form action={moveChecklistItem.bind(null, c.id, id, 1)}><button disabled={ci === items.length - 1} title="เลื่อนลง" className="text-ink-soft hover:text-purple disabled:opacity-20 leading-none"><ChevronDown size={14} /></button></form>
                  </span>}
                  {isOwner && <form action={deleteChecklistItem.bind(null, c.id, id)} className=""><button className="text-ink-soft hover:text-red"><Trash2 size={13} /></button></form>}
                  </div>
                </li>
              ))}
            </ul>
            <form action={addChecklistItem.bind(null, id)} className="flex flex-wrap sm:flex-nowrap gap-2 mt-3"><input name="label" className="input" placeholder="+ เพิ่มข้อ" /><DateInput name="due_date" className="input w-40" /><select name="assignee_id" defaultValue="" className="input sm:w-36"><option value="">ผู้รับผิดชอบ</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn-outline whitespace-nowrap">เพิ่ม</button></form>
          </div>

          {/* thread */}
          <Thread taskId={id} initial={(comments ?? []) as Comment[]} meId={me} members={mentionMembers} names={await userNames(supabase)} />
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
            {isSw && canStage && task.status === "accepted" && (
              <form action={swStepBack.bind(null, id)} className="space-y-1">
                <button className="btn-outline w-full text-xs py-1.5">↩ ย้อนกลับไป “สินค้าถึงแล้ว” (ยังไม่ได้อัพเข้าระบบ)</button>
              </form>
            )}
            {isSw && canStage && ["prep", "shipped", "arrived"].includes(task.status) && (
              <form className="space-y-2">
                <div className="flex items-center gap-1 text-[11px] text-ink-soft flex-wrap">{(["prep", "shipped", "arrived", "accepted"] as TaskStatus[]).map((s, i) => <span key={s} className={`rounded-full px-2 py-0.5 ${task.status === s ? "bg-purple text-white font-semibold" : (["prep", "shipped", "arrived", "accepted"].indexOf(task.status) > i ? "bg-green/15 text-green" : "bg-cream")}`}>{i + 1}. {statusLabel(s, "sw-room")}</span>)}</div>
                <input name="note" className="input" placeholder="หมายเหตุ (ถ้ามี) เช่น เลขพัสดุ / ผู้รับ" />
                {task.status === "prep" && <button formAction={setTaskStatus.bind(null, id, "shipped")} className="btn-primary w-full">🚚 ส่งสินค้าแล้ว</button>}
                {task.status === "shipped" && <button formAction={setTaskStatus.bind(null, id, "arrived")} className="btn-primary w-full">📦 สินค้าถึงห้างแล้ว</button>}
                {task.status === "arrived" && <button formAction={setTaskStatus.bind(null, id, "accepted")} className="btn-primary w-full">✔ อัพเข้าระบบเรียบร้อย — ปิดงาน</button>}
                <button formAction={swStepBack.bind(null, id)} className="btn-outline w-full text-xs py-1.5">↩ ย้อนกลับไป “{task.status === "prep" ? "รอตรวจรับ" : task.status === "shipped" ? "เตรียมส่ง" : "ส่งสินค้าแล้ว"}”</button>
              </form>
            )}
            {/* ขอเลื่อนกำหนดส่ง (0063) */}
            {task.pending_due && (
              <div className="rounded-xl bg-yellow/20 text-[#7a4a00] text-sm p-3 space-y-2">
                <div>⏳ ขอเลื่อนกำหนดส่ง {task.due_date ? fmtDate(task.due_date) : "—"} → <b>{fmtDate(task.pending_due)}</b></div>
                <div className="text-xs">เหตุผล: {task.pending_due_reason}</div>
                {(session.isAdmin || isLead) && (task.pending_due_by !== me || session.isAdmin) && (
                  <form className="space-y-2">
                    <input name="note" className="input !py-1.5 text-xs" placeholder="หมายเหตุ (ไม่บังคับ)" />
                    <div className="flex gap-2">
                      <button formAction={decidePostpone.bind(null, id, true)} className="btn-primary flex-1 py-1.5">อนุมัติเลื่อน</button>
                      <button formAction={decidePostpone.bind(null, id, false)} className="btn-outline flex-1 py-1.5">ไม่อนุมัติ</button>
                    </div>
                  </form>
                )}
              </div>
            )}
            {!task.pending_due && isAssignee && !["accepted", "cancelled"].includes(task.status) && (
              <details className="rounded-xl border border-line">
                <summary className="list-none cursor-pointer px-3 py-2 text-sm font-semibold text-purple">📅 ขอเลื่อนกำหนดส่ง</summary>
                <form action={requestPostpone.bind(null, id)} className="px-3 pb-3 space-y-2">
                  <div><label className="label">กำหนดส่งใหม่</label><DateInput name="new_due" className="input" required /></div>
                  <div><label className="label">เหตุผล *</label><textarea name="reason" required rows={2} className="input" placeholder="เช่น รอไฟล์จากลูกค้า / งานด่วนแทรก / กำหนดเดิมกรอกผิด" /></div>
                  <button className="btn-primary w-full">ส่งขออนุมัติ</button>
                  <div className="text-[11px] text-ink-soft">หัวหน้าห้องและผู้บริหารได้แจ้งเตือน · อนุมัติแล้วใช้กำหนดใหม่คิด "ส่งตรงเวลา" · ขอก่อนถึงกำหนดจะดีที่สุด</div>
                </form>
              </details>
            )}
            {(task.postpone_count ?? 0) > 0 && <div className="text-[11px] text-ink-soft">เลื่อนกำหนดแล้ว {task.postpone_count} ครั้ง (ดูประวัติในคอมเมนต์)</div>}
            {/* ส่งต่องาน (0059) */}
            {task.pending_forward_to && (
              <div className="rounded-xl bg-yellow/20 text-[#7a4a00] text-sm p-3 space-y-2">
                <div>⏳ ขอส่งต่องานให้ <b>{nameOf(task.pending_forward_to)}</b> · รอหัวหน้าอนุมัติ{task.pending_forward_note ? ` · ${task.pending_forward_note}` : ""}</div>
                {(session.isAdmin || isLead) && <div className="flex gap-2">
                  <form action={decideForward.bind(null, id, true)} className="flex-1"><button className="btn-primary w-full py-1.5">อนุมัติ</button></form>
                  <form action={decideForward.bind(null, id, false)} className="flex-1"><button className="btn-outline w-full py-1.5">ไม่อนุมัติ</button></form>
                </div>}
              </div>
            )}
            {!task.pending_forward_to && !["accepted", "cancelled"].includes(task.status) && (isOwner || task.assignee_id === myEmp) && (() => {
              const needApprove = !isOwner && (task.forward_count ?? 0) > 0;
              return (
                <details className="rounded-xl border border-line">
                  <summary className="list-none cursor-pointer px-3 py-2 text-sm font-semibold text-purple flex items-center gap-1.5">↪ ส่งต่องาน{needApprove ? " (ต้องให้หัวหน้าอนุมัติ)" : ""}</summary>
                  <form action={forwardTask.bind(null, id)} className="px-3 pb-3 space-y-2">
                    <div><label className="label">ส่งต่อให้</label><select name="to" required defaultValue="" className="input"><option value="" disabled>เลือกคนรับงานใหม่</option>{people.filter((p) => !p.id.startsWith("u:") && p.id !== task.assignee_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                    <div><label className="label">เหตุผล (ไม่บังคับ)</label><input name="note" className="input" placeholder="เช่น ติดงานด่วน / งานนี้ต้องใช้คนคลัง" /></div>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="keep" /> ให้ผู้รับเดิมเป็นผู้ร่วมงานต่อ</label>
                    <button className="btn-primary w-full">{needApprove ? "ส่งขออนุมัติ" : "ส่งต่องาน"}</button>
                    <div className="text-[11px] text-ink-soft">งานเดิมใบเดียว เปลี่ยนแค่ผู้รับ · คนใหม่และผู้สั่งงานได้แจ้งเตือน</div>
                  </form>
                </details>
              );
            })()}
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
