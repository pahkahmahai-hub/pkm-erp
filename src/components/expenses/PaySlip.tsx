"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, X, Loader2 } from "lucide-react";
import { uploadExpenseFiles, type UpFile } from "@/lib/expenses/upload";
import { payWithSlip } from "@/app/(app)/expenses/actions";
import { PAY_METHODS } from "@/lib/expenses/types";

type Sel = { id: string; no: string; supplier: string; net: number };
const Ctx = createContext<{ sel: Sel[]; toggle: (s: Sel) => void; open: (only?: Sel) => void } | null>(null);
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ครอบหน้าเตรียมจ่าย: เลือกหลายใบ → แนบสลิปเดียว → จ่ายแล้วพร้อมกัน */
export function PaySlipProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sel, setSel] = useState<Sel[]>([]);
  const [modal, setModal] = useState<Sel[] | null>(null);
  const [slips, setSlips] = useState<UpFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState(today()); const [method, setMethod] = useState("โอน"); const [ref, setRef] = useState("");
  const inp = useRef<HTMLInputElement>(null);

  const toggle = (s: Sel) => setSel((x) => (x.some((y) => y.id === s.id) ? x.filter((y) => y.id !== s.id) : [...x, s]));
  const open = (only?: Sel) => { setModal(only ? [only] : sel); setSlips([]); setErr(null); setRef(""); setDate(today()); };
  const up = async (files: File[]) => { if (!files.length) return; setBusy("อัปโหลดสลิป…"); setErr(null); try { const u = await uploadExpenseFiles(files, "slip"); setSlips((s) => [...s, ...u]); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };
  const pay = async () => {
    if (!modal) return; setBusy("กำลังบันทึกจ่าย…"); setErr(null);
    const r = await payWithSlip(modal.map((m) => m.id), slips.map((s) => ({ path: s.path, kind: "slip" })), date, method, ref || null);
    setBusy(null);
    if (r.error) { setErr(r.error); return; }
    setModal(null); setSel([]); router.refresh();
  };
  const total = (l: Sel[]) => l.reduce((a, s) => a + s.net, 0);

  return (
    <Ctx.Provider value={{ sel, toggle, open }}>
      {children}
      {sel.length > 0 && !modal && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-3 bg-white/95 border-t border-line flex items-center justify-between gap-3 md:left-64">
          <div className="text-sm">เลือก <b>{sel.length}</b> ใบ · รวม <b>฿{fmt(total(sel))}</b></div>
          <div className="flex gap-2"><button onClick={() => setSel([])} className="btn-ghost text-sm">ล้าง</button><button onClick={() => open()} className="btn-primary text-sm"><Receipt size={15} /> แนบสลิป + จ่ายแล้ว</button></div>
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center" onClick={() => !busy && setModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start"><h3 className="font-display font-bold text-lg">จ่ายแล้ว {modal.length > 1 ? `${modal.length} ใบ` : modal[0].no}</h3><button onClick={() => setModal(null)}><X size={18} /></button></div>
            <ul className="text-sm divide-y divide-line max-h-40 overflow-auto">{modal.map((m) => <li key={m.id} className="py-1.5 flex justify-between"><span>{m.supplier} <span className="text-[11px] text-ink-soft">{m.no}</span></span><b>{fmt(m.net)}</b></li>)}</ul>
            <div className="text-right text-sm">รวมโอน <b className="text-lg font-display">฿{fmt(total(modal))}</b></div>
            <button type="button" onClick={() => inp.current?.click()} className="btn-outline w-full py-3"><Receipt size={18} /> {slips.length ? "เพิ่มสลิป" : "เลือก / ถ่ายสลิปโอนเงิน"}</button>
            <input ref={inp} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { up(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            {slips.length > 0 && <div className="flex gap-2 flex-wrap">{slips.map((s) => <div key={s.path} className="relative h-20 w-16 rounded border border-line overflow-hidden bg-cream grid place-items-center text-[10px]">{/* eslint-disable-next-line @next/next/no-img-element */}{s.url ? <img src={s.url} alt="" className="w-full h-full object-cover" /> : "PDF"}<button onClick={() => setSlips((x) => x.filter((y) => y.path !== s.path))} className="absolute top-0 right-0 bg-white/90 rounded-full"><X size={12} /></button></div>)}</div>}
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">วันที่จ่าย</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></div>
              <div><label className="label">วิธีจ่าย</label><select value={method} onChange={(e) => setMethod(e.target.value)} className="input">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
              <div className="col-span-2"><label className="label">อ้างอิง (เลขที่รายการในสลิป)</label><input value={ref} onChange={(e) => setRef(e.target.value)} className="input" /></div>
            </div>
            {err && <div className="text-sm text-red">{err}</div>}
            <button disabled={!!busy} onClick={pay} className="btn-primary w-full py-3">{busy ? <><Loader2 size={16} className="animate-spin" /> {busy}</> : `ยืนยันจ่ายแล้ว ${modal.length > 1 ? `${modal.length} ใบ` : ""}`}</button>
            <p className="text-[11px] text-ink-soft">สลิปจะแนบไว้ในทุกใบที่เลือก · ถ้ามีหัก ณ ที่จ่าย ระบบออก 50 ทวิ ให้อัตโนมัติ</p>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function PaySelect({ s }: { s: Sel }) {
  const c = useContext(Ctx); if (!c) return null;
  return <input type="checkbox" checked={c.sel.some((x) => x.id === s.id)} onChange={() => c.toggle(s)} className="h-4 w-4 accent-purple" aria-label="เลือก" />;
}
export function PaySlipButton({ s }: { s: Sel }) {
  const c = useContext(Ctx); if (!c) return null;
  return <button type="button" onClick={() => c.open(s)} className="btn-primary !py-1 !px-2.5 !text-xs"><Receipt size={13} /> แนบสลิป + จ่าย</button>;
}
