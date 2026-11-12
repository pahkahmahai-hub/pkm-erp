"use client";

import { useMemo, useState, useTransition } from "react";
import { MapPin, Clock, Repeat, Trash2, X, Check, Plus } from "lucide-react";
import type { CompanyEvent, EventCategory } from "@/lib/work/types";
import { addDays, fmtDM, TH_MONTHS } from "@/lib/work/deliveries";
import { expandEvents, dayDiff, type Occ } from "@/lib/work/events";
import { saveCompanyEvent, deleteCompanyEvent } from "@/app/(app)/work/actions";

const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
interface Props { month: string; today: string; events: CompanyEvent[]; categories: EventCategory[]; meId: string; isAdmin: boolean }
interface Seg { occ: Occ; col: number; span: number; lane: number; isStart: boolean; isEnd: boolean }

const mondayOf = (s: string) => { const d = new Date(s + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); };
const pad = (n: number) => String(n).padStart(2, "0");

export function MonthCalendar({ month, today, events, categories, meId, isAdmin }: Props) {
  const [list, setList] = useState<CompanyEvent[]>(events);
  const [draft, setDraft] = useState<Partial<CompanyEvent> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const catOf = (ev: CompanyEvent) => categories.find((c) => c.id === ev.category_id) ?? ev.event_categories ?? null;

  const weeks = useMemo(() => {
    const first = month + "-01"; const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); const last = `${month}-${pad(lastDay)}`;
    const rows: string[] = []; for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) rows.push(w);
    const occs = expandEvents(list, rows[0], addDays(rows[rows.length - 1], 6));
    return rows.map((wk) => {
      const wkEnd = addDays(wk, 6);
      const segs: Seg[] = [];
      const lanesEnd: number[] = [];   // per lane: last used col
      const inWeek = occs.filter((o) => o.end >= wk && o.start <= wkEnd).sort((a, b) => a.start.localeCompare(b.start) || dayDiff(b.start, b.end) - dayDiff(a.start, a.end));
      for (const o of inWeek) {
        const col = Math.max(0, dayDiff(wk, o.start)); const endCol = Math.min(6, dayDiff(wk, o.end));
        let lane = lanesEnd.findIndex((e) => e < col); if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(-1); }
        lanesEnd[lane] = endCol;
        segs.push({ occ: o, col, span: endCol - col + 1, lane, isStart: o.start >= wk, isEnd: o.end <= wkEnd });
      }
      return { wk, days: Array.from({ length: 7 }, (_, i) => addDays(wk, i)), segs, lanes: lanesEnd.length };
    });
  }, [list, month]);

  const openNew = (date: string) => { setErr(null); setDraft({ start_date: date, end_date: date, category_id: categories[0]?.id ?? null, recur: null }); };
  const openEdit = (ev: CompanyEvent) => { setErr(null); setDraft({ ...ev }); };
  const canEdit = (ev: Partial<CompanyEvent>) => isAdmin || !ev.id || ev.created_by === meId;
  const submit = (fd: FormData) => start(async () => {
    const r = await saveCompanyEvent(fd);
    if (r.error || !r.row) { setErr(r.error ?? "บันทึกไม่สำเร็จ"); return; }
    const row = r.row as unknown as CompanyEvent;
    setList((x) => (x.some((e) => e.id === row.id) ? x.map((e) => (e.id === row.id ? row : e)) : [...x, row]));
    setDraft(null);
  });
  const remove = () => { if (!draft?.id || !confirm("ลบกิจกรรมนี้?")) return; const id = draft.id; start(async () => { const r = await deleteCompanyEvent(id); if (r.error) { setErr(r.error); return; } setList((x) => x.filter((e) => e.id !== id)); setDraft(null); }); };

  const [y, m] = month.split("-").map(Number);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-[11px] items-center">
        {categories.map((c) => <span key={c.id} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 border border-line"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.name}</span>)}
        <span className="text-ink-soft ml-1">· แถบ = ช่วงหลายวัน · จุด = งานวันเดียว · กดวันที่เพื่อเพิ่ม กดงานเพื่อแก้</span>
      </div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-cream text-sm font-semibold text-center border-b border-line">{DOW.map((d, i) => <div key={d} className={`py-2.5 ${i >= 5 ? "text-ink-soft" : ""}`}>{d}</div>)}</div>
        {weeks.map((w) => (
          <div key={w.wk} className="grid grid-cols-7 border-b border-line last:border-b-0 relative min-h-[120px]" style={{ gridTemplateRows: `30px repeat(${w.lanes}, 28px) minmax(12px, 1fr)` }}>
            {w.days.map((d, i) => {
              const inMonth = d.slice(0, 7) === month; const isToday = d === today;
              return (
                <div key={d} className={`row-span-full border-l first:border-l-0 border-line ${!inMonth ? "bg-cream/40" : i >= 5 ? "bg-cream/20" : ""}`} style={{ gridColumn: i + 1, gridRow: "1 / -1" }}>
                  <button type="button" onClick={() => openNew(d)} className="w-full h-full text-left group flex items-start" aria-label="เพิ่มกิจกรรม">
                    <span className={`inline-grid place-items-center h-7 min-w-7 px-1 m-1 rounded-full text-sm ${isToday ? "bg-red text-white font-bold" : inMonth ? "text-ink" : "text-ink-soft/60"}`}>{Number(d.slice(8))}</span>
                    <Plus size={12} className="inline text-ink-soft/0 group-hover:text-ink-soft" />
                  </button>
                </div>);
            })}
            {w.segs.map((s) => {
              const c = catOf(s.occ.ev); const single = s.occ.start === s.occ.end;
              return (
                <button key={s.occ.ev.id + s.occ.start} type="button" onClick={() => openEdit(s.occ.ev)} title={`${s.occ.ev.title}${s.occ.ev.location ? " · " + s.occ.ev.location : ""}\n${fmtDM(s.occ.start)}${s.occ.start !== s.occ.end ? " – " + fmtDM(s.occ.end) : ""}`}
                  className={`z-10 mx-1 h-6 text-[13px] font-semibold leading-6 truncate text-left px-2 ${single ? "bg-white text-ink ring-1 ring-line rounded-md" : `text-white ${s.isStart ? "rounded-l-md ml-1" : ""} ${s.isEnd ? "rounded-r-md mr-1" : ""}`}`}
                  style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 2, background: single ? undefined : c?.color ?? "#6b7280" }}>
                  {single && <span className="inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle" style={{ background: c?.color ?? "#6b7280" }} />}
                  {s.occ.ev.recur && <Repeat size={10} className="inline mr-0.5 opacity-80" />}{s.occ.ev.start_time && single ? s.occ.ev.start_time.slice(0, 5) + " " : ""}{s.occ.ev.title}
                </button>);
            })}
          </div>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !pending && setDraft(null)}>
          <form action={submit} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-auto shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <input type="hidden" name="id" value={draft.id ?? ""} />
            <div className="flex items-start justify-between"><h2 className="font-display font-bold text-lg">{draft.id ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรมในปฏิทินบริษัท"}</h2><button type="button" onClick={() => setDraft(null)} className="text-ink-soft"><X size={18} /></button></div>
            {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-2">{err}</div>}
            <fieldset disabled={!canEdit(draft)} className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className="label">ชื่อกิจกรรม *</label><input name="title" defaultValue={draft.title ?? ""} className="input" required autoFocus placeholder="เช่น ออกบูธ Central Chidlom / ประชุมประจำเดือน" /></div>
              <div className="sm:col-span-2"><label className="label">ประเภท</label>
                <div className="flex flex-wrap gap-1.5">{categories.map((c) => <label key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs has-[:checked]:ring-2 has-[:checked]:ring-ink cursor-pointer"><input type="radio" name="category_id" value={c.id} defaultChecked={draft.category_id === c.id} className="sr-only" /><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name}</label>)}</div></div>
              <div><label className="label">วันเริ่ม *</label><input type="date" name="start_date" defaultValue={draft.start_date ?? ""} className="input" required /></div>
              <div><label className="label">วันสิ้นสุด <span className="text-ink-soft font-normal">(ว่าง = วันเดียว)</span></label><input type="date" name="end_date" defaultValue={draft.end_date && draft.end_date !== draft.start_date ? draft.end_date : ""} className="input" /></div>
              <div><label className="label">เวลาเริ่ม</label><input type="time" name="start_time" defaultValue={draft.start_time?.slice(0, 5) ?? ""} className="input" /></div>
              <div><label className="label">เวลาสิ้นสุด</label><input type="time" name="end_time" defaultValue={draft.end_time?.slice(0, 5) ?? ""} className="input" /></div>
              <div className="sm:col-span-2 flex items-center gap-2"><MapPin size={14} className="text-ink-soft" /><input name="location" defaultValue={draft.location ?? ""} className="input" placeholder="สถานที่ (ห้าง / ชั้น / showroom)" /></div>
              <div className="sm:col-span-2"><label className="label">รายละเอียด</label><textarea name="note" defaultValue={draft.note ?? ""} className="input" rows={2} /></div>
              <div><label className="label flex items-center gap-1"><Repeat size={12} /> งานซ้ำ</label><select name="recur" defaultValue={draft.recur ?? ""} className="input"><option value="">ไม่ซ้ำ</option><option value="weekly">ทุกสัปดาห์ (วันเดียวกับวันเริ่ม)</option><option value="monthly">ทุกเดือน (วันที่เดียวกับวันเริ่ม)</option></select></div>
              <div><label className="label">ซ้ำถึงวันที่ <span className="text-ink-soft font-normal">(ว่าง = ไม่มีกำหนด)</span></label><input type="date" name="recur_until" defaultValue={draft.recur_until ?? ""} className="input" /></div>
            </fieldset>
            <div className="flex items-center gap-2 pt-1">
              {draft.id && canEdit(draft) && <button type="button" onClick={remove} disabled={pending} className="btn-outline !border-red !text-red"><Trash2 size={14} /> ลบ</button>}
              {!canEdit(draft) && <span className="text-xs text-ink-soft">แก้ไขได้เฉพาะผู้สร้างหรือผู้บริหาร</span>}
              <span className="ml-auto flex gap-2"><button type="button" onClick={() => setDraft(null)} className="btn-outline">ปิด</button>{canEdit(draft) && <button disabled={pending} className="btn-primary"><Check size={16} /> {pending ? "กำลังบันทึก…" : "บันทึก"}</button>}</span>
            </div>
          </form>
        </div>
      )}
      <p className="text-xs text-ink-soft"><Clock size={11} className="inline" /> {TH_MONTHS[m - 1]} {y + 543} · เพิ่มได้ทุกคน · แก้/ลบได้โดยผู้สร้างและผู้บริหาร</p>
    </div>
  );
}
