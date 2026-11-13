import Link from "next/link";
import { CalendarDays, Check, Flame, Repeat } from "lucide-react";
import { fmtDateShort, todayBkk } from "@/lib/format";
import { STATUS_BADGE, statusLabel, effectiveDue, swDeadlines, swCurrentPhase, type Task } from "@/lib/work/types";

const isClosed = (t: Task) => ["accepted", "cancelled", "done"].includes(t.status);
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

export function TaskCard({ t, showRoom = true, note, compact }: { t: Task; showRoom?: boolean; note?: string; compact?: boolean }) {
  if (compact) return <CompactCard t={t} />;
  const today = todayBkk();
  const due = effectiveDue(t);
  const overdue = !!due && due < today && !isClosed(t);
  const dueToday = due === today;
  const isSw = t.work_rooms?.key === "sw-room";
  const ph = isSw ? swCurrentPhase(t.status) : null;
  const phLabel = ph ? swDeadlines(t).find((d) => d.phase === ph)?.short + " " : "";
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
        {due && (
          <span className={`flex items-center gap-1 ${overdue ? "text-red font-semibold" : dueToday ? "text-[#8a6a00] font-semibold" : ""}`}>
            <CalendarDays size={12} /> {phLabel}{overdue ? "เลยกำหนด " : dueToday ? "วันนี้ " : ""}{fmtDateShort(due)}
          </span>
        )}
      </div>
    </Link>
  );
}

/** แถบกำหนด 3 ระยะของงานส่งห้าง: ✓ ผ่านแล้ว · ระยะปัจจุบันเน้นสี (แดง = เลยกำหนด) · ~ = คาดการณ์ */
export function SwDeadlineStrip({ t, size = "sm" }: { t: Task; size?: "sm" | "md" }) {
  const today = todayBkk();
  const cur = swCurrentPhase(t.status);
  const order = ["pack", "arrive", "system"];
  const curIdx = cur ? order.indexOf(cur) : 3;
  return (
    <div className={`grid grid-cols-3 ${size === "md" ? "gap-2" : "gap-1"}`}>
      {swDeadlines(t).map((d, i) => {
        const past = i < curIdx; const now = i === curIdx; const late = now && !!d.date && d.date < today; const isToday = now && d.date === today;
        const cls = past ? "bg-green/10 text-green" : late ? "bg-red text-white" : isToday ? "bg-yellow text-ink" : now ? "bg-purple text-white" : "bg-cream text-ink-soft";
        return (
          <div key={d.phase} className={`rounded-md text-center leading-tight ${size === "md" ? "px-2 py-1.5" : "px-0.5 py-1"} ${cls}`} title={`${d.label}${d.date ? ": " + d.date : ""}${d.estimated && d.phase === "system" ? " (คาดการณ์ — นับ 7 วันจริงเมื่อกดสินค้าถึงแล้ว)" : ""}`}>
            <div className={size === "md" ? "text-[11px]" : "text-[9px]"}>{past && <Check size={9} className="inline -mt-0.5" />} {size === "md" ? d.label : d.short}</div>
            <div className={`font-bold ${size === "md" ? "text-sm" : "text-[11px]"}`}>{d.date ? (d.estimated && d.phase === "system" ? "~" : "") + (size === "md" ? fmtDateShort(d.date) : dm(d.date)) : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/** การ์ดย่อสำหรับบอร์ด — เตี้ย เกือบสี่เหลี่ยม · ข้อความหลัง " — " (เช่น สัปดาห์ …) เป็นบรรทัดเล็ก */
function CompactCard({ t }: { t: Task }) {
  const today = todayBkk();
  const due = effectiveDue(t);
  const overdue = !!due && due < today && !isClosed(t);
  const dueToday = due === today;
  const isSw = t.work_rooms?.key === "sw-room";
  const i = t.title.indexOf(" — ");
  const main = i > 0 ? t.title.slice(0, i) : t.title;
  const sub = i > 0 ? t.title.slice(i + 3) : null;
  return (
    <Link href={`/work/tasks/${t.id}`} className={`card px-2.5 py-2 block hover:border-purple transition ${overdue ? "border-red/60" : ""}`} title={t.title}>
      <div className="flex items-center justify-between gap-1 text-[10px] text-ink-soft font-mono"><span>#{t.task_no}</span><span className="flex items-center gap-1 font-sans">{t.priority === "urgent" && <Flame size={11} className="text-red" />}{t.routine_id && <Repeat size={10} />}{isSw && <span className="truncate">{t.employees ? (t.employees.nickname ?? t.employees.first_name) : "—"}</span>}</span></div>
      <div className="text-[13px] font-semibold leading-tight line-clamp-2 mt-0.5">{main}</div>
      {sub && <div className="text-[10px] text-ink-soft leading-tight truncate">{sub}</div>}
      {isSw && t.status !== "accepted" && t.status !== "cancelled" ? (
        <div className="mt-1.5"><SwDeadlineStrip t={t} /></div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-ink-soft">
          <span className="truncate">{t.employees ? (t.employees.nickname ?? t.employees.first_name) : "—"}</span>
          {due && <span className={`shrink-0 flex items-center gap-0.5 ${overdue ? "text-red font-semibold" : dueToday ? "text-[#8a6a00] font-semibold" : ""}`}><CalendarDays size={10} />{overdue ? "เลย " : dueToday ? "วันนี้ " : ""}{fmtDateShort(due)}</span>}
        </div>
      )}
    </Link>
  );
}
