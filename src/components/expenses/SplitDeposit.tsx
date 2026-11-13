"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, X, Loader2 } from "lucide-react";
import { splitExpenseDeposit } from "@/app/(app)/expenses/actions";
import { nextPayRound } from "@/lib/expenses/types";

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addDays = (s: string, n: number) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/** จ่ายมัดจำก่อน → แยกบิลส่วนที่เหลือรอจ่ายตามกำหนดของงาน */
export function SplitDeposit({ id, grand, whtPct, billDate }: { id: string; grand: number; whtPct: number; billDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(true); const [val, setVal] = useState("50");
  const [due, setDue] = useState(addDays(billDate, 30)); const [round, setRound] = useState(nextPayRound(addDays(billDate, 30)));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const dep = Math.round((pct ? grand * (parseFloat(val) || 0) / 100 : parseFloat(val) || 0) * 100) / 100;
  const rest = Math.round((grand - dep) * 100) / 100;
  const go = async () => {
    setBusy(true); setErr(null);
    const r = await splitExpenseDeposit(id, dep, due, round || null);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setOpen(false); router.refresh();
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-outline w-full"><Coins size={16} /> จ่ายมัดจำก่อน · แยกยอดที่เหลือ</button>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between"><h3 className="font-display font-bold text-lg">จ่ายมัดจำก่อน</h3><button onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="text-sm text-ink-soft">ยอดตามบิล <b className="text-ink">{fmt(grand)}</b></div>
            <div>
              <label className="label flex items-center gap-1.5">มัดจำ <span className="inline-flex rounded-md border border-line text-[11px] overflow-hidden">{(["%", "฿"] as const).map((m) => <button key={m} type="button" onClick={() => setPct(m === "%")} className={`px-1.5 ${(m === "%") === pct ? "bg-purple text-white" : ""}`}>{m}</button>)}</span></label>
              <div className="flex gap-1.5 mb-1.5">{pct && [30, 50, 70].map((p) => <button key={p} type="button" onClick={() => setVal(String(p))} className={`rounded-full px-3 py-1 text-xs border ${val === String(p) ? "bg-purple text-white border-purple" : "border-line"}`}>{p}%</button>)}</div>
              <input type="number" step="0.01" value={val} onChange={(e) => setVal(e.target.value)} className="input" />
            </div>
            <div className="rounded-xl bg-cream p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>มัดจำ (บิลนี้ — จ่ายตอนนี้)</span><b>{fmt(dep)}</b></div>
              <div className="flex justify-between"><span>ส่วนที่เหลือ (บิลใหม่ — รอจ่าย)</span><b>{fmt(rest)}</b></div>
              {whtPct > 0 && <div className="text-[11px] text-ink-soft">หัก ณ ที่จ่าย {whtPct}% คิดแยกในแต่ละบิล</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">ครบกำหนดจ่ายส่วนที่เหลือ</label><input type="date" value={due} onChange={(e) => { setDue(e.target.value); if (e.target.value) setRound(nextPayRound(e.target.value)); }} className="input" /><p className="text-[11px] text-ink-soft mt-0.5">ตามระยะผลิตของงานนี้</p></div>
              <div><label className="label">รอบจ่าย (1 / 15)</label><input type="date" value={round} onChange={(e) => setRound(e.target.value)} className="input" /></div>
            </div>
            {err && <div className="text-sm text-red">{err}</div>}
            <button disabled={busy || dep <= 0 || rest <= 0} onClick={go} className="btn-primary w-full">{busy ? <Loader2 size={16} className="animate-spin" /> : null} แยกบิล — มัดจำ {fmt(dep)} / เหลือ {fmt(rest)}</button>
            <p className="text-[11px] text-ink-soft">บิลนี้จะเหลือ 1 บรรทัด "มัดจำ" ไว้จ่ายตอนนี้ · รายการสินค้าเดิมย้ายไปบิลส่วนที่เหลือ (ใช้ปุ่มเข้าสต็อกที่บิลนั้นตอนรับของ) · รูปบิลคัดลอกไปด้วย</p>
          </div>
        </div>
      )}
    </>
  );
}
