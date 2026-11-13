"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, X, Trash2, Search, ExternalLink, Check, ClipboardList } from "lucide-react";
import { STEPS, stepMeta, fmtDM, addDays, mondayOf, TH_MONTHS, type DeliveryStore, type StoreDelivery, type WeekCol } from "@/lib/work/deliveries";
import { saveStoreDelivery, deleteStoreDelivery, createDeliveryTask, type DeliveryPayload } from "@/app/(app)/work/actions";

export interface EmpLite { id: string; first_name: string; nickname: string | null }
export interface SalesDocLite { id: string; doc_no: string; doc_type: string; customer_name: string; doc_date: string; status: string }
interface Props { stores: DeliveryStore[]; deliveries: StoreDelivery[]; weeks: WeekCol[]; employees: EmpLite[]; salesDocs: SalesDocLite[]; canEdit: boolean; today: string; userNames: Record<string, string> }

type Draft = { id: string | null; store: DeliveryStore; week: string; target_date: string; arrive_due: string; step: number; doc_no: string; sales_doc_id: string | null; po_no: string; assignee_id: string; note: string; task_id: string | null; log: StoreDelivery["step_log"] };

export function DeliveryBoard({ stores, deliveries, weeks, employees, salesDocs, canEdit, today, userNames }: Props) {
  const [rows, setRows] = useState<StoreDelivery[]>(deliveries);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const thisWeek = mondayOf(today);

  const byCell = useMemo(() => { const m = new Map<string, StoreDelivery[]>(); for (const d of rows) { const k = d.store_id + "|" + d.week_start; m.set(k, [...(m.get(k) ?? []), d]); } return m; }, [rows]);
  const months = useMemo(() => { const out: { ym: string; label: string; count: number }[] = []; for (const w of weeks) { const last = out[out.length - 1]; if (last && last.ym === w.month) last.count++; else { const [y, mo] = w.month.split("-").map(Number); out.push({ ym: w.month, label: `${TH_MONTHS[mo - 1]} ${y + 543}`, count: 1 }); } } return out; }, [weeks]);
  const groups = useMemo(() => { const out: { name: string; list: DeliveryStore[] }[] = []; for (const s of stores) { const g = s.group_name ?? "อื่น ๆ"; const last = out[out.length - 1]; if (last && last.name === g) last.list.push(s); else out.push({ name: g, list: [s] }); } return out; }, [stores]);

  const openNew = (store: DeliveryStore, week: string) => { if (!canEdit) return; setErr(null); setDraft({ id: null, store, week, target_date: "", arrive_due: "", step: 1, doc_no: "", sales_doc_id: null, po_no: "", assignee_id: "", note: "", task_id: null, log: [] }); };
  const openEdit = (d: StoreDelivery) => { const store = stores.find((s) => s.id === d.store_id); if (!store) return; setErr(null); setDraft({ id: d.id, store, week: d.week_start, target_date: d.target_date ?? "", arrive_due: d.arrive_due ?? "", step: d.step, doc_no: d.doc_no ?? "", sales_doc_id: d.sales_doc_id, po_no: d.po_no ?? "", assignee_id: d.assignee_id ?? "", note: d.note ?? "", task_id: d.task_id ?? null, log: d.step_log ?? [] }); };

  const persist = async (d: Draft): Promise<StoreDelivery | null> => {
    const p: DeliveryPayload = { id: d.id, store_id: d.store.id, week: d.week, target_date: d.target_date || null, step: d.step, doc_no: d.doc_no || null, sales_doc_id: d.sales_doc_id, po_no: d.po_no || null, assignee_id: d.assignee_id || null, note: d.note || null, arrive_due: d.arrive_due || null };
    const r = await saveStoreDelivery(p);
    if (r.error || !r.row) { setErr(r.error ?? "บันทึกไม่สำเร็จ"); return null; }
    const row = r.row as unknown as StoreDelivery;
    const full = { ...row, employees: employees.find((e) => e.id === row.assignee_id) ?? null };
    setRows((x) => (x.some((y) => y.id === full.id) ? x.map((y) => (y.id === full.id ? full : y)) : [...x, full]));
    return full;
  };
  const save = () => { if (!draft) return; const d = draft; start(async () => { if (await persist(d)) setDraft(null); }); };
  // save first (so the job links back), then create a work task in SW ROOM for the assignee
  const makeJob = () => {
    if (!draft) return;
    if (!draft.assignee_id) { setErr("เลือกผู้รับผิดชอบก่อนสร้าง job"); return; }
    const d = draft;
    start(async () => {
      const saved = await persist(d);
      if (!saved) return;
      const title = `ส่งสินค้า ${d.store.name} — สัปดาห์ ${fmtDM(d.week)}–${fmtDM(addDays(d.week, 6))}`;
      const desc = [d.doc_no && `ใบส่งของ: ${d.doc_no}`, d.po_no && `PO ห้าง: ${d.po_no}`, d.target_date && `กำหนดจัดเสร็จ: ${fmtDM(d.target_date)}`, d.arrive_due && `กำหนดถึงห้าง: ${fmtDM(d.arrive_due)}`, d.note].filter(Boolean).join("\n") || null;
      const checklist = STEPS.filter((s) => s.n > d.step).map((s) => `${s.n}. ${s.label}`);
      const r = await createDeliveryTask(saved.id, title, desc, checklist);
      if (r.error || !r.taskId) { setErr(r.error ?? "สร้าง job ไม่สำเร็จ"); return; }
      const taskId = r.taskId;
      setRows((x) => x.map((y) => (y.id === saved.id ? { ...y, task_id: taskId } : y)));
      setDraft({ ...d, id: saved.id, task_id: taskId, log: saved.step_log });
    });
  };
  const remove = () => {
    if (!draft?.id || !confirm("ลบรายการส่งนี้?")) return;
    const id = draft.id;
    start(async () => { const r = await deleteStoreDelivery(id); if (r.error) { setErr(r.error); return; } setRows((x) => x.filter((y) => y.id !== id)); setDraft(null); });
  };

  return (
    <div className="space-y-3">
      {/* legend */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {STEPS.map((s) => <span key={s.n} className="rounded-md px-2 py-0.5 font-medium" style={{ background: s.bg, color: s.fg }}>{s.n}. {s.short}</span>)}
        <span className="text-ink-soft self-center ml-1">· กดช่องว่างเพื่อเพิ่ม · กดเลขใบเพื่ออัปเดตขั้นตอน</span>
      </div>

      <div className="card overflow-auto max-h-[75vh]">
        <table className="text-xs border-separate border-spacing-0 min-w-max">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-30 bg-cream text-left px-3 py-2 border-b border-r border-line min-w-[180px]">ห้าง / สาขา</th>
              {months.map((m) => <th key={m.ym} colSpan={m.count} className="bg-purple text-white font-display font-bold px-2 py-1.5 border-l border-white/30 text-center">{m.label}</th>)}
            </tr>
            <tr>
              {weeks.map((w) => <th key={w.start} className={`px-1 py-1 border-b border-l border-line text-center font-normal min-w-[88px] ${w.start === thisWeek ? "bg-yellow/40 font-bold" : "bg-cream"}`}>{fmtDM(w.start)}–{fmtDM(w.end)}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.name} g={g} weeks={weeks} byCell={byCell} canEdit={canEdit} thisWeek={thisWeek} openNew={openNew} openEdit={openEdit} />
            ))}
            {!stores.length && <tr><td colSpan={weeks.length + 1} className="p-6 text-center text-ink-soft">ยังไม่มีห้าง — เพิ่มได้ที่ปุ่ม “จัดการห้าง”</td></tr>}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !pending && setDraft(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: draft.store.color }} /><h2 className="font-display font-bold text-lg">{draft.store.name}</h2></div>
                <p className="text-xs text-ink-soft">สัปดาห์ {fmtDM(draft.week)}–{fmtDM(addDays(draft.week, 6))}{draft.id ? "" : " · รายการใหม่"}</p>
              </div>
              <button type="button" onClick={() => setDraft(null)} className="text-ink-soft hover:text-ink"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-2">{err}</div>}
              <div>
                <label className="label">ขั้นตอน</label>
                <div className="grid grid-cols-7 gap-1">
                  {STEPS.map((s) => <button key={s.n} type="button" onClick={() => setDraft({ ...draft, step: s.n })} className={`rounded-lg py-2 text-[11px] leading-tight font-semibold border-2 ${draft.step === s.n ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`} style={{ background: s.bg, color: s.fg }}>{s.n}<br />{s.short}</button>)}
                </div>
                <p className="text-[11px] text-ink-soft mt-1">{draft.step}. {stepMeta(draft.step).label}</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">เลขใบส่งของ / ใบกำกับ</label><input value={draft.doc_no} onChange={(e) => setDraft({ ...draft, doc_no: e.target.value })} className="input" placeholder="เช่น INV2026110012" /></div>
                <div><label className="label">PO ห้าง</label><input value={draft.po_no} onChange={(e) => setDraft({ ...draft, po_no: e.target.value })} className="input" /></div>
                <DocPicker docs={salesDocs} value={draft.sales_doc_id} onPick={(doc) => setDraft({ ...draft, sales_doc_id: doc?.id ?? null, doc_no: doc ? doc.doc_no : draft.doc_no, step: doc && doc.status !== "draft" && draft.step < 3 ? 3 : draft.step })} />
                <div><label className="label">ผู้รับผิดชอบ</label><select value={draft.assignee_id} onChange={(e) => setDraft({ ...draft, assignee_id: e.target.value })} className="input"><option value="">— ไม่ระบุ —</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.nickname ?? e.first_name}</option>)}</select></div>
                <div><label className="label">สัปดาห์ (เลือกวันใดก็ได้ในสัปดาห์)</label><input type="date" value={draft.week} onChange={(e) => e.target.value && setDraft({ ...draft, week: mondayOf(e.target.value) })} className="input" /></div>
                <div><label className="label">① กำหนดจัดของเสร็จ</label><input type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} className="input" /></div>
                <div><label className="label">② กำหนดส่งถึงห้าง <span className="font-normal text-ink-soft">(ว่าง = จัดเสร็จ +2 วัน)</span></label><input type="date" value={draft.arrive_due} onChange={(e) => setDraft({ ...draft, arrive_due: e.target.value })} className="input" /></div>
                <p className="sm:col-span-2 text-[11px] text-ink-soft -mt-1">③ กำหนดอัพเข้าระบบ = วันที่กด “สินค้าถึงแล้ว” + 7 วัน (รอ PC อัพ) — ระบบนับให้อัตโนมัติ</p>
              </div>
              <div><label className="label">หมายเหตุ</label><input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="input" placeholder="เช่น รอผ้าลายใหม่ / ส่งทาง Kerry" /></div>
              {draft.log.length > 0 && (
                <div className="text-[11px] text-ink-soft space-y-0.5">
                  <div className="font-semibold text-ink">ประวัติขั้นตอน</div>
                  {[...draft.log].reverse().map((l, i) => <div key={i}><span className="inline-block rounded px-1.5 mr-1" style={{ background: stepMeta(l.step).bg, color: stepMeta(l.step).fg }}>{l.step}. {stepMeta(l.step).short}</span>{new Date(l.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} · {l.auto ? "อัตโนมัติ (ออกเอกสารขาย)" : (l.by && userNames[l.by]) || "—"}</div>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {draft.id && <button type="button" onClick={remove} disabled={pending} className="btn-outline !border-red !text-red"><Trash2 size={14} /> ลบ</button>}
                {draft.task_id
                  ? <Link href={`/work/tasks/${draft.task_id}`} className="btn-outline"><ClipboardList size={14} /> เปิด job</Link>
                  : <button type="button" onClick={makeJob} disabled={pending} className="btn-outline" title="บันทึกแล้วสร้างงานสั่งใน SW ROOM ให้ผู้รับผิดชอบ พร้อมเช็คลิสต์ขั้นตอนที่เหลือ"><ClipboardList size={14} /> สร้าง job ให้{draft.assignee_id ? " " + (employees.find((e) => e.id === draft.assignee_id)?.nickname ?? employees.find((e) => e.id === draft.assignee_id)?.first_name ?? "") : "ผู้รับผิดชอบ"}</button>}
                <span className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setDraft(null)} className="btn-outline">ยกเลิก</button>
                  <button type="button" onClick={() => save()} disabled={pending} className="btn-primary"><Check size={16} /> {pending ? "กำลังบันทึก…" : "บันทึก"}</button>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRows({ g, weeks, byCell, canEdit, thisWeek, openNew, openEdit }: { g: { name: string; list: DeliveryStore[] }; weeks: WeekCol[]; byCell: Map<string, StoreDelivery[]>; canEdit: boolean; thisWeek: string; openNew: (s: DeliveryStore, w: string) => void; openEdit: (d: StoreDelivery) => void }) {
  return (
    <>
      <tr><td colSpan={weeks.length + 1} className="sticky left-0 bg-lavender/40 text-[11px] font-semibold text-purple-dark px-3 py-1 border-b border-line">{g.name}</td></tr>
      {g.list.map((s) => (
        <tr key={s.id} className="group">
          <td className="sticky left-0 z-10 bg-white group-hover:bg-cream/60 px-3 py-1.5 border-b border-r border-line font-medium whitespace-nowrap"><span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ background: s.color }} />{s.short_name ?? s.name}</td>
          {weeks.map((w) => {
            const list = byCell.get(s.id + "|" + w.start) ?? [];
            return (
              <td key={w.start} className={`border-b border-l border-line p-0.5 align-top ${w.start === thisWeek ? "bg-yellow/10" : ""}`}>
                <div className="flex flex-col gap-0.5 min-h-[30px]">
                  {list.map((d) => { const m = stepMeta(d.step); return (
                    <button key={d.id} type="button" onClick={() => openEdit(d)} title={`${m.n}. ${m.label}${d.employees ? " · " + (d.employees.nickname ?? d.employees.first_name) : ""}${d.note ? "\n" + d.note : ""}`}
                      className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-left leading-tight hover:ring-2 ring-ink/30" style={{ background: m.bg, color: m.fg }}>
                      {d.doc_no ?? <span className="font-normal italic">ยังไม่มีเลขใบ</span>}{d.task_id && <ClipboardList size={10} className="inline ml-1 opacity-70" />}<span className="block text-[9px] font-normal opacity-80">{m.n}. {m.short}{d.target_date ? " · " + fmtDM(d.target_date) : ""}</span>
                    </button>); })}
                  {canEdit && <button type="button" onClick={() => openNew(s, w.start)} className={`rounded-md text-ink-soft/0 hover:text-ink-soft hover:bg-cream grid place-items-center ${list.length ? "h-4" : "flex-1 min-h-[28px]"}`} aria-label="เพิ่ม"><Plus size={12} /></button>}
                </div>
              </td>);
          })}
        </tr>
      ))}
    </>
  );
}

function DocPicker({ docs, value, onPick }: { docs: SalesDocLite[]; value: string | null; onPick: (d: SalesDocLite | null) => void }) {
  const [q, setQ] = useState("");
  const cur = docs.find((d) => d.id === value);
  const res = useMemo(() => { const s = q.trim().toLowerCase(); return s ? docs.filter((d) => d.doc_no.toLowerCase().includes(s) || d.customer_name.toLowerCase().includes(s)).slice(0, 8) : []; }, [q, docs]);
  return (
    <div className="relative sm:col-span-2">
      <label className="label">ผูกกับเอกสารขายในระบบ (ใบส่งของ/ใบกำกับ) — เมื่อออกเอกสารแล้วจะเลื่อนเป็นขั้น 3 อัตโนมัติ</label>
      {cur ? (
        <div className="flex items-center gap-2 text-sm"><span className="badge-base bg-lavender/40 text-purple-dark">{cur.doc_no}</span><span className="text-ink-soft truncate">{cur.customer_name}</span>
          <Link href={`/sales/docs/${cur.id}`} target="_blank" className="text-purple"><ExternalLink size={14} /></Link>
          <button type="button" onClick={() => onPick(null)} className="ml-auto text-xs text-red">ยกเลิกการผูก</button></div>
      ) : (
        <div className="relative"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-8" placeholder="ค้นหาเลขเอกสาร / ชื่อลูกค้า (เอกสาร 90 วันล่าสุด)" />
          {res.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 card p-1 max-h-56 overflow-auto">{res.map((d) => <button key={d.id} type="button" onClick={() => { onPick(d); setQ(""); }} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream"><b>{d.doc_no}</b> <span className="text-xs text-ink-soft">{d.status === "draft" ? "ร่าง" : "ออกแล้ว"} · {d.doc_date}</span><div className="text-[11px] text-ink-soft truncate">{d.customer_name}</div></button>)}</div>}
        </div>
      )}
    </div>
  );
}
