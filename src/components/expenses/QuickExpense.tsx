"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Receipt, X, Loader2, CheckCircle2 } from "lucide-react";
import { uploadExpenseFiles, type UpFile } from "@/lib/expenses/upload";
import { quickExpense } from "@/app/(app)/expenses/actions";
import { PAY_METHODS } from "@/lib/expenses/types";

type Sup = { id: string; name: string; default_expense_category: string | null; default_wht_pct: number | null; default_vat_mode_purchase: string | null };
type Cat = { id: string; name: string; wht_pct: number | null };
type Co = { id: string; code: string; name_th: string };

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm border ${on ? "bg-purple text-white border-purple" : "border-line bg-white"}`;

export function QuickExpense({ companies, suppliers, categories, isAdmin, shared }: { companies: Co[]; suppliers: Sup[]; categories: Cat[]; isAdmin: boolean; shared: boolean }) {
  const [files, setFiles] = useState<UpFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  const [company, setCompany] = useState(companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id ?? "");
  const [supName, setSupName] = useState(""); const [supId, setSupId] = useState<string | null>(null);
  const [cat, setCat] = useState(""); const [amount, setAmount] = useState(""); const [vat, setVat] = useState<"none" | "inclusive" | "exclusive">("none");
  const [wht, setWht] = useState(0); const [desc, setDesc] = useState(""); const [billNo, setBillNo] = useState(""); const [billDate, setBillDate] = useState(today());
  const [payNow, setPayNow] = useState(isAdmin); const [paidDate, setPaidDate] = useState(today()); const [method, setMethod] = useState("โอน"); const [ref, setRef] = useState("");
  const billRef = useRef<HTMLInputElement>(null); const slipRef = useRef<HTMLInputElement>(null);

  const add = async (list: File[], kind: UpFile["kind"]) => {
    if (!list.length) return;
    setErr(null); setBusy("กำลังอัปโหลดรูป…");
    try { const up = await uploadExpenseFiles(list, kind); setFiles((f) => [...f, ...up]); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  // รูปที่แชร์มาจากแอปธนาคาร (Android) — service worker เก็บไว้ใน cache "pkm-share"
  useEffect(() => {
    if (!shared || typeof caches === "undefined") return;
    (async () => {
      const c = await caches.open("pkm-share"); const keys = await c.keys(); const list: File[] = [];
      for (const k of keys) { const r = await c.match(k); if (!r) continue; const b = await r.blob(); list.push(new File([b], decodeURIComponent(k.url.split("/").pop() ?? "shared.jpg"), { type: b.type || "image/jpeg" })); await c.delete(k); }
      if (list.length) await add(list, "slip");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const pickSup = (name: string) => {
    setSupName(name); const s = suppliers.find((x) => x.name === name);
    setSupId(s?.id ?? null);
    if (s) { if (s.default_expense_category) setCat(s.default_expense_category); if (s.default_wht_pct != null) setWht(Number(s.default_wht_pct)); if (s.default_vat_mode_purchase) setVat(s.default_vat_mode_purchase as typeof vat); }
  };
  const reset = () => { setFiles([]); setSupName(""); setSupId(null); setCat(""); setAmount(""); setVat("none"); setWht(0); setDesc(""); setBillNo(""); setBillDate(today()); setPaidDate(today()); setRef(""); setDone(null); setErr(null); };

  const save = async () => {
    setErr(null); setBusy("กำลังบันทึก…");
    const r = await quickExpense({ company_id: company, supplier_id: supId, supplier_name: supName, category_id: cat || null, description: desc || null, amount: Number(amount.replace(/,/g, "")) || 0,
      vat_mode: vat, wht_pct: wht, bill_no: billNo || null, bill_date: billDate, files: files.map((f) => ({ path: f.path, kind: f.kind })), pay_now: payNow, paid_date: paidDate, paid_method: method, paid_ref: ref || null });
    setBusy(null);
    if (r.error && !r.id) { setErr(r.error); return; }
    if (r.error) setErr(r.error);
    setDone({ id: r.id!, text: payNow && isAdmin ? "บันทึกแล้ว — สถานะ จ่ายแล้ว" : isAdmin ? "บันทึกแล้ว — อยู่ในเตรียมจ่าย (แนบสลิปตอนโอน)" : "บันทึกแล้ว — รออนุมัติ" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const amt = Number(amount.replace(/,/g, "")) || 0;
  const base = vat === "inclusive" ? amt / 1.07 : amt;
  const net = (vat === "exclusive" ? amt * 1.07 : amt) - base * wht / 100;

  if (done) return (
    <div className="card p-6 text-center space-y-4">
      <CheckCircle2 size={44} className="mx-auto text-green" />
      <div className="font-display font-bold text-lg">{done.text}</div>
      {err && <div className="text-xs text-red">{err}</div>}
      <div className="flex flex-col gap-2"><button onClick={reset} className="btn-primary">+ บันทึกรายการต่อไป</button><Link href={`/expenses/${done.id}`} className="btn-outline">ดูรายการ</Link></div>
    </div>
  );

  return (
    <div className="space-y-4 pb-24">
      {/* photos */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => billRef.current?.click()} className="btn-outline py-3"><Camera size={18} /> รูปบิล / รายการ</button>
          <button type="button" onClick={() => slipRef.current?.click()} className="btn-outline py-3"><Receipt size={18} /> สลิปโอนเงิน</button>
        </div>
        <input ref={billRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add(Array.from(e.target.files ?? []), "bill"); e.target.value = ""; }} />
        <input ref={slipRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add(Array.from(e.target.files ?? []), "slip"); e.target.value = ""; }} />
        {files.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={f.path} className="relative">
                <div className="aspect-[3/4] rounded-lg overflow-hidden border border-line bg-cream grid place-items-center text-xs text-ink-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.url ? <img src={f.url} alt="" className="w-full h-full object-cover" /> : "PDF"}
                </div>
                <button type="button" onClick={() => setFiles((x) => x.map((y, j) => (j === i ? { ...y, kind: y.kind === "slip" ? "bill" : "slip" } : y)))} className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${f.kind === "slip" ? "bg-green text-white" : "bg-purple text-white"}`}>{f.kind === "slip" ? "สลิป" : "บิล"} ⇄</button>
                <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 rounded-full bg-white/90 p-0.5"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        {busy && <div className="text-xs text-ink-soft flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> {busy}</div>}
      </div>

      {/* main */}
      <div className="card p-4 space-y-3">
        {companies.length > 1 && <div className="flex gap-2">{companies.map((c) => <button key={c.id} type="button" onClick={() => setCompany(c.id)} className={chip(company === c.id)}>{c.code}</button>)}</div>}
        <div><label className="label">ร้าน / ซัพพลายเออร์ *</label><input value={supName} onChange={(e) => pickSup(e.target.value)} list="qe-sup" className="input text-base" placeholder="พิมพ์หรือเลือก" /><datalist id="qe-sup">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>{supName && !supId && <p className="text-[11px] text-ink-soft mt-0.5">ร้านใหม่ (ไม่อยู่ในสมุดรายชื่อ) — บันทึกได้</p>}</div>
        <div><label className="label">ยอดเงินตามบิล *</label><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input text-2xl font-display font-bold" placeholder="0.00" /></div>
        <div className="flex flex-wrap gap-1.5">{([["none", "ไม่มี VAT"], ["inclusive", "รวม VAT แล้ว"], ["exclusive", "+VAT 7%"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setVat(k)} className={chip(vat === k)}>{l}</button>)}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm"><span className="text-ink-soft">หัก ณ ที่จ่าย</span>{[0, 1, 3, 5].map((p) => <button key={p} type="button" onClick={() => setWht(p)} className={chip(wht === p)}>{p ? `${p}%` : "ไม่หัก"}</button>)}</div>
        {(vat !== "none" || wht > 0) && amt > 0 && <div className="text-sm text-ink-soft">จ่ายจริง <b className="text-ink">{net.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> บาท</div>}
        <div><label className="label">หมวดค่าใช้จ่าย</label><select value={cat} onChange={(e) => { setCat(e.target.value); const c = categories.find((x) => x.id === e.target.value); if (c && !wht && Number(c.wht_pct) > 0) setWht(Number(c.wht_pct)); }} className="input"><option value="">— เลือก —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label">รายละเอียด</label><input value={desc} onChange={(e) => setDesc(e.target.value)} className="input" placeholder="เช่น ค่าป้ายแท็ก 10,000 ชิ้น" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">เลขที่บิล</label><input value={billNo} onChange={(e) => setBillNo(e.target.value)} className="input" /></div>
          <div><label className="label">วันที่บิล</label><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="input" /></div>
        </div>
      </div>

      {isAdmin && (
        <div className="card p-4 space-y-3">
          <label className="flex items-center justify-between font-semibold"><span>จ่ายเงินแล้ว (มีสลิป)</span>
            <button type="button" onClick={() => setPayNow(!payNow)} className={`relative h-7 w-12 rounded-full transition ${payNow ? "bg-green" : "bg-line"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${payNow ? "left-[22px]" : "left-0.5"}`} /></button>
          </label>
          {payNow ? (
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">วันที่จ่าย</label><input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="input" /></div>
              <div><label className="label">วิธีจ่าย</label><select value={method} onChange={(e) => setMethod(e.target.value)} className="input">{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
              <div className="col-span-2"><label className="label">อ้างอิง (เลขที่รายการในสลิป)</label><input value={ref} onChange={(e) => setRef(e.target.value)} className="input" /></div>
            </div>
          ) : <p className="text-xs text-ink-soft">ปิดไว้ = บันทึกบิลไว้ก่อน รายการจะไปอยู่ "เตรียมจ่าย" แล้วค่อยแนบสลิปตอนโอน</p>}
        </div>
      )}

      {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{err}</div>}
      <div className="fixed bottom-0 inset-x-0 p-3 bg-white/95 border-t border-line md:static md:bg-transparent md:border-0 md:p-0 z-20">
        <button type="button" disabled={!!busy} onClick={save} className="btn-primary w-full py-3 text-base">{busy ? <Loader2 size={18} className="animate-spin" /> : null} {payNow && isAdmin ? "บันทึก — จ่ายแล้ว" : isAdmin ? "บันทึก — รอจ่าย" : "บันทึก — ส่งอนุมัติ"}</button>
      </div>
    </div>
  );
}
