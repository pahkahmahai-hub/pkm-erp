"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Plus, X, Repeat, Image as ImageIcon } from "lucide-react";
import type { Task, Topic } from "@/lib/work/types";
import { addDays, fmtDM } from "@/lib/work/deliveries";
import { createCalendarTask } from "@/app/(app)/work/actions";

const DOW = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
interface Row { id: string; name: string; is_lead: boolean }
interface Props { roomId: string; roomKey: string; week: string; today: string; rows: Row[]; tasks: Task[]; topics: Topic[]; myEmployeeId: string | null; isAdmin: boolean }

const fridayOf = (d: string) => { const i = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7; return i <= 4 ? addDays(d, 4 - i) : addDays(d, 11 - i); };

export function WeekCalendar({ roomId, roomKey, week, today, rows, tasks, topics, myEmployeeId, isAdmin }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const [draft, setDraft] = useState<{ assignee: string; date: string } | null>(null);
  const byCell = useMemo(() => { const m = new Map<string, Task[]>(); for (const t of tasks) { const d = t.start_date ?? t.due_date; if (!d) continue; const k = (t.assignee_id ?? "none") + "|" + d; m.set(k, [...(m.get(k) ?? []), t]); } return m; }, [tasks]);
  const allRows = useMemo(() => (tasks.some((t) => !t.assignee_id) ? [...rows, { id: "none", name: "ยังไม่ระบุผู้รับ", is_lead: false }] : rows), [rows, tasks]);
  const canAddFor = (empId: string) => isAdmin || rows.some((r) => r.id === myEmployeeId && r.is_lead) || empId === myEmployeeId || empId === "none";

  return (
    <div className="space-y-3">
      <div className="card overflow-auto">
        <table className="text-xs border-separate border-spacing-0 min-w-max w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-cream text-left px-3 py-2 border-b border-r border-line min-w-[130px]">ทีม</th>
              {days.map((d, i) => <th key={d} className={`px-2 py-2 border-b border-l border-line text-center font-semibold ${i >= 5 ? "min-w-[96px]" : "min-w-[150px]"} ${d === today ? "bg-yellow/40" : i >= 5 ? "bg-cream/60 text-ink-soft" : "bg-cream"}`}>{DOW[i]}<span className="block text-[11px] font-normal text-ink-soft">{fmtDM(d)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => (
              <tr key={r.id} className="group align-top">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-cream/60 px-3 py-2 border-b border-r border-line font-semibold whitespace-nowrap">{r.name}{r.is_lead && <span className="text-yellow ml-1">★</span>}</td>
                {days.map((d, i) => {
                  const list = byCell.get(r.id + "|" + d) ?? [];
                  return (
                    <td key={d} className={`border-b border-l border-line p-1 ${d === today ? "bg-yellow/10" : i >= 5 ? "bg-cream/30" : ""}`}>
                      <div className="flex flex-col gap-1 min-h-[56px]">
                        {list.map((t) => <Chip key={t.id} t={t} />)}
                        {canAddFor(r.id) && <button type="button" onClick={() => setDraft({ assignee: r.id === "none" ? "" : r.id, date: d })} className={`rounded-md text-ink-soft/0 hover:text-ink-soft hover:bg-cream grid place-items-center ${list.length ? "h-5" : "flex-1 min-h-[40px]"}`} aria-label="ลงงาน"><Plus size={13} /></button>}
                      </div>
                    </td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px] text-ink-soft items-center">
        <span>หัวข้อ:</span>{topics.map((t) => <span key={t.id} className="rounded-md px-2 py-0.5 border" style={{ borderColor: t.color, color: t.color }}>{t.name}</span>)}
        <span className="ml-2"><Repeat size={11} className="inline" /> = งานประจำที่ระบบสร้างให้ · ขีดฆ่า = เสร็จแล้ว · <Flame size={11} className="inline text-red" /> = ด่วน</span>
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setDraft(null)}>
          <form action={createCalendarTask} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-auto shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <input type="hidden" name="room_id" value={roomId} /><input type="hidden" name="room_key" value={roomKey} /><input type="hidden" name="week" value={week} />
            <div className="flex items-start justify-between"><h2 className="font-display font-bold text-lg">ลงงานในปฏิทิน</h2><button type="button" onClick={() => setDraft(null)} className="text-ink-soft"><X size={18} /></button></div>
            <NewTaskFields rows={rows} topics={topics} draft={draft} />
            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <button type="button" onClick={() => setDraft(null)} className="btn-outline">ยกเลิก</button>
              <button name="open" value="1" className="btn-outline"><ImageIcon size={14} /> บันทึกแล้วเปิดงาน (แนบรูป)</button>
              <button className="btn-primary">บันทึก</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NewTaskFields({ rows, topics, draft }: { rows: Row[]; topics: Topic[]; draft: { assignee: string; date: string } }) {
  const [assignee, setAssignee] = useState(draft.assignee);
  const [start, setStart] = useState(draft.date);
  const [due, setDue] = useState(fridayOf(draft.date));
  const myTopics = topics.filter((t) => !t.employee_id || t.employee_id === assignee);
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2"><label className="label">ชื่องาน *</label><input name="title" className="input" required autoFocus placeholder="เช่น ภาพโปรโมชัน 12.12 / รีวิวลูกค้า" /></div>
      <div><label className="label">ผู้รับผิดชอบ</label><select name="assignee_id" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input"><option value="">— ยังไม่ระบุ —</option>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      <div><label className="label">หัวข้อ Routine</label><select name="topic_id" className="input" defaultValue=""><option value="">— ไม่ระบุ —</option>{myTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div><label className="label">วันเริ่ม / วันที่ลงปฏิทิน</label><input type="date" name="start_date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value) setDue(fridayOf(e.target.value)); }} className="input" required /></div>
      <div><label className="label">กำหนดเสร็จ <span className="text-ink-soft font-normal">(ว่าง = ศุกร์ 17:30)</span></label><div className="flex gap-2"><input type="date" name="due_date" value={due} onChange={(e) => setDue(e.target.value)} className="input" /><input type="time" name="due_time" defaultValue="17:30" className="input w-28" /></div></div>
      <div className="sm:col-span-2"><label className="label">รายละเอียด</label><textarea name="description" className="input" rows={2} placeholder="brief / ลิงก์อ้างอิง / ขนาด" /></div>
      <div className="sm:col-span-2"><label className="label">เช็คลิสต์ย่อย (บรรทัดละ 1 ข้อ)</label><textarea name="checklist" className="input font-mono text-xs" rows={2} /></div>
      <div className="sm:col-span-2 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="priority" value="normal" defaultChecked className="accent-purple" /> ปกติ</label><label className="flex items-center gap-2"><input type="radio" name="priority" value="urgent" className="accent-red" /> <Flame size={14} className="text-red" /> ด่วน</label></div>
    </div>
  );
}

function Chip({ t }: { t: Task }) {
  const done = t.status === "done" || t.status === "accepted";
  const color = t.work_topics?.color ?? "#9ca3af";
  return (
    <Link href={`/work/tasks/${t.id}`} className={`block rounded-md border-l-4 bg-white px-1.5 py-1 shadow-sm hover:shadow ring-1 ring-line ${done ? "opacity-60" : ""}`} style={{ borderLeftColor: color }} title={`#${t.task_no} ${t.title}${t.work_topics ? " · " + t.work_topics.name : ""}`}>
      <div className={`font-semibold leading-tight line-clamp-2 ${done ? "line-through" : ""}`}>{t.priority === "urgent" && <Flame size={11} className="inline text-red mr-0.5" />}{t.routine_id && <Repeat size={10} className="inline text-ink-soft mr-0.5" />}{t.title}</div>
      <div className="text-[10px] text-ink-soft flex justify-between gap-1"><span className="truncate">{t.work_topics?.name ?? ""}</span><span>{t.due_date && t.start_date !== t.due_date ? "→ " + fmtDM(t.due_date) : ""}{t.due_time ? " " + t.due_time.slice(0, 5) : ""}</span></div>
    </Link>
  );
}
