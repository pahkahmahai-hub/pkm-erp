import Link from "next/link";
import { CalendarDays, Flame, Repeat } from "lucide-react";
import { fmtDateShort, todayBkk } from "@/lib/format";
import { STATUS_BADGE, statusLabel, type Task } from "@/lib/work/types";

export function TaskCard({ t, showRoom = true, note, compact }: { t: Task; showRoom?: boolean; note?: string; compact?: boolean }) {
  if (compact) return <CompactCard t={t} />;
  const overdue = !!t.due_date && t.due_date < todayBkk() && !["accepted", "cancelled", "done"].includes(t.status);
  const dueToday = t.due_date === todayBkk();
  return (
    <Link href={`/work/tasks/${t.id}`} className={`card p-3.5 block hover:border-purple transition ${overdue ? "border-red/60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-ink-soft font-mono">#{t.task_no}{showRoom && t.work_rooms && <span className="ml-2 inline-block px-1.5 rounded text-white" style={{ background: t.work_rooms.color }}>{t.work_rooms.name}</span>}</div>
          <div className="font-semibold leading-snug mt-0.5">{t.priority === "urgent" && <Flame size={14} className="inline text-red mr-1" />}{t.routine_id && <Repeat size={13} className="inline text-ink-soft mr-1" />}{t.title}</div>
        </div>
        <span className={`${STATUS_BADGE[t.status]} shrink-0`}>{statusLabel(t.status, t.work_rooms?.key)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
        <span>{t.employees ? (t.employees.nickname ?? t.employees.first_name) : "ยังไม่มอบหมาย"}{note && <span className="ml-2 text-green font-semibold">· {note}</span>}</span>
        {t.due_date && (
          <span className={`flex items-center gap-1 ${overdue ? "text-red font-semibold" : dueToday ? "text-[#8a6a00] font-semibold" : ""}`}>
            <CalendarDays size={12} /> {overdue ? "เลยกำหนด " : dueToday ? "วันนี้ " : ""}{fmtDateShort(t.due_date)}
          </span>
        )}
      </div>
    </Link>
  );
}

/** การ์ดย่อสำหรับบอร์ด — เตี้ย เกือบสี่เหลี่ยม · ข้อความหลัง " — " (เช่น สัปดาห์ …) เป็นบรรทัดเล็ก */
function CompactCard({ t }: { t: Task }) {
  const overdue = !!t.due_date && t.due_date < todayBkk() && !["accepted", "cancelled", "done"].includes(t.status);
  const dueToday = t.due_date === todayBkk();
  const i = t.title.indexOf(" — ");
  const main = i > 0 ? t.title.slice(0, i) : t.title;
  const sub = i > 0 ? t.title.slice(i + 3) : null;
  return (
    <Link href={`/work/tasks/${t.id}`} className={`card px-2.5 py-2 block hover:border-purple transition ${overdue ? "border-red/60" : ""}`} title={t.title}>
      <div className="flex items-center justify-between gap-1 text-[10px] text-ink-soft font-mono"><span>#{t.task_no}</span>{t.priority === "urgent" && <Flame size={11} className="text-red" />}{t.routine_id && <Repeat size={10} />}</div>
      <div className="text-[13px] font-semibold leading-tight line-clamp-2 mt-0.5">{main}</div>
      {sub && <div className="text-[10px] text-ink-soft leading-tight truncate">{sub}</div>}
      <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-ink-soft">
        <span className="truncate">{t.employees ? (t.employees.nickname ?? t.employees.first_name) : "—"}</span>
        {t.due_date && <span className={`shrink-0 flex items-center gap-0.5 ${overdue ? "text-red font-semibold" : dueToday ? "text-[#8a6a00] font-semibold" : ""}`}><CalendarDays size={10} />{overdue ? "เลย " : dueToday ? "วันนี้ " : ""}{fmtDateShort(t.due_date)}</span>}
      </div>
    </Link>
  );
}
