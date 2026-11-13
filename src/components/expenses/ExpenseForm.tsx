"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Plus, Trash2, Search, Sparkles, AlertTriangle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import type { Company, VatMode } from "@/lib/sales/types";
import type { Contact } from "@/lib/stock/types";
import type { AiBill, Expense, ExpenseCategory, ExpenseItem } from "@/lib/expenses/types";
import type { Product, Material } from "@/lib/stock/types";
import { WHT_CHOICES, nextPayRound } from "@/lib/expenses/types";

type SupplierLite = Pick<Contact, "id" | "name" | "code" | "tax_id" | "address" | "address2" | "address3" | "postcode" | "branch_code" | "entity_type"> & { default_expense_category?: string | null; default_wht_pct?: number | null; default_vat_mode_purchase?: VatMode | null };
type ProductLite = Pick<Product, "id" | "code" | "name" | "barcode" | "unit">;
type MaterialLite = Pick<Material, "id" | "code" | "name" | "unit" | "kind">;
interface Line { key: string; description: string; qty: number; unit: string; unit_price: number; disc?: string; product_id?: string | null; material_id?: string | null }
/** ส่วนลดรายบรรทัด: "15" = 15 บาท · "10%" = 10% ของ จำนวน × ราคา */
const lineDisc = (l: Line) => { const s = (l.disc ?? "").trim(); if (!s) return 0; const gross = l.qty * l.unit_price; const v = parseFloat(s.replace(/[%,]/g, "")) || 0; return Math.round((s.endsWith("%") ? gross * v / 100 : v) * 100) / 100; };
interface Up { path: string; url: string; name: string }
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function ExpenseForm({ companies, suppliers, categories, products = [], materials = [], expense, items, existingFiles, aiEnabled, splitLocked }: {
  companies: Company[]; suppliers: SupplierLite[]; categories: ExpenseCategory[]; products?: ProductLite[]; materials?: MaterialLite[]; expense?: Expense | null; items?: ExpenseItem[]; existingFiles?: Up[]; aiEnabled: boolean; splitLocked?: boolean;
}) {
  const e = expense;
  const [companyId, setCompanyId] = useState(e?.company_id ?? companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id);
  const [sup, setSup] = useState({ id: e?.supplier_id ?? null as string | null, name: e?.supplier_name ?? "", tax_id: e?.supplier_tax_id ?? "", address: e?.supplier_address ?? "", branch: e?.supplier_branch ?? "", is_company: e?.supplier_is_company ?? true });
  const [sq, setSq] = useState("");
  const [categoryId, setCategoryId] = useState(e?.category_id ?? "");
  const [billNo, setBillNo] = useState(e?.bill_no ?? "");
  const [billDate, setBillDate] = useState(e?.bill_date ?? today());
  const [dueDate, setDueDate] = useState(e?.due_date ?? "");
  const [desc, setDesc] = useState(e?.description ?? "");
  const [vatMode, setVatMode] = useState<VatMode>(e?.vat_mode ?? "none");
  const [discInput, setDiscInput] = useState(String(Number(e?.discount_amount ?? 0) || ""));
  const [discPct, setDiscPct] = useState(false);
  const [deposit, setDeposit] = useState(String(Number((e as { deposit_amount?: number } | null | undefined)?.deposit_amount ?? 0) || ""));
  const [depPct, setDepPct] = useState(false);
  const hadDeposit = Number((e as { deposit_amount?: number } | null | undefined)?.deposit_amount ?? 0) > 0;
  // โหมดมัดจำ: none = ไม่มี · first = จ่ายมัดจำรอบนี้ (แยกยอดคงเหลือไปบิลใหม่) · later = หักมัดจำที่จ่ายไปแล้ว
  const [depMode, setDepMode] = useState<"none" | "first" | "later">(hadDeposit ? "later" : "none");
  const [restDue, setRestDue] = useState("");
  const [depositNote, setDepositNote] = useState((e as { deposit_note?: string | null } | null | undefined)?.deposit_note ?? "");
  const [wht, setWht] = useState(Number(e?.wht_pct ?? 0));
  const [payRound, setPayRound] = useState(e?.pay_round ?? nextPayRound(today()));
  const [note, setNote] = useState(e?.note ?? "");
  const [lines, setLines] = useState<Line[]>((items ?? []).map((i) => ({ key: i.id, description: i.description, qty: Number(i.qty), unit: i.unit ?? "", unit_price: Number(i.unit_price), disc: Number((i as { discount?: number }).discount ?? 0) ? String(Number((i as { discount?: number }).discount)) : "", product_id: i.product_id, material_id: i.material_id })));
  const [pq, setPq] = useState("");
  const prodResults = useMemo(() => {
    const q = pq.trim().toLowerCase(); if (!q) return [] as { kind: "product" | "material"; id: string; label: string; sub: string; unit: string }[];
    const a = products.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q)).slice(0, 6).map((p) => ({ kind: "product" as const, id: p.id, label: p.name, sub: `${p.code}${p.barcode ? ` · ${p.barcode}` : ""}`, unit: p.unit }));
    const b = materials.filter((m) => (m.code ?? "").toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 6).map((m) => ({ kind: "material" as const, id: m.id, label: m.name, sub: `${m.kind === "fabric" ? "ลายผ้า" : "แพคเกจจิ้ง"}${m.code ? ` · ${m.code}` : ""}`, unit: m.unit }));
    return [...a, ...b];
  }, [pq, products, materials]);
  function addCatalog(r: { kind: "product" | "material"; id: string; label: string; unit: string }) {
    setLines((l) => [...l, { key: crypto.randomUUID(), description: r.label, qty: 1, unit: r.unit, unit_price: 0, product_id: r.kind === "product" ? r.id : null, material_id: r.kind === "material" ? r.id : null }]);
    setPq("");
  }
  const [files, setFiles] = useState<Up[]>(existingFiles ?? []);
  const [uploading, setUploading] = useState(false);
  const [ai, setAi] = useState<{ busy: boolean; bill: AiBill | null; error: string | null }>({ busy: false, bill: null, error: null });
  const fileRef = useRef<HTMLInputElement>(null);

  const supResults = useMemo(() => { const s = sq.trim().toLowerCase(); return s ? suppliers.filter((c) => c.name.toLowerCase().includes(s) || (c.tax_id ?? "").includes(s)).slice(0, 8) : []; }, [sq, suppliers]);

  function pickSupplier(c: SupplierLite) {
    setSup({ id: c.id, name: c.name, tax_id: c.tax_id ?? "", address: [c.address, c.address2, c.address3, c.postcode].filter(Boolean).join(" "), branch: c.branch_code ?? "", is_company: c.entity_type !== "บุคคลธรรมดา" });
    if (c.default_expense_category) setCategoryId(c.default_expense_category);
    if (c.default_wht_pct != null) setWht(Number(c.default_wht_pct));
    if (c.default_vat_mode_purchase) setVatMode(c.default_vat_mode_purchase);
    setSq("");
  }
  function onCategory(id: string) {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c && wht === 0 && Number(c.wht_pct) > 0) setWht(Number(c.wht_pct));
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    const supabase = createClient();
    const ups: Up[] = [];
    try {
      for (const raw of Array.from(list).slice(0, 4)) {
        const isPdf = raw.type === "application/pdf";
        const f = isPdf ? raw : await compressImage(raw, 2000, 0.85);
        const d = new Date();
        const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
        const { error } = await supabase.storage.from("expense-files").upload(path, f, { contentType: isPdf ? "application/pdf" : "image/jpeg" });
        if (error) throw error;
        const { data } = await supabase.storage.from("expense-files").createSignedUrl(path, 3600);
        ups.push({ path, url: data?.signedUrl ?? "", name: raw.name });
      }
      setFiles((x) => [...x, ...ups]);
      if (aiEnabled && !e) await runAi([...files, ...ups].map((u) => u.path));
    } catch (err) { setAi((a) => ({ ...a, error: (err as Error).message })); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function runAi(paths: string[]) {
    setAi({ busy: true, bill: null, error: null });
    try {
      const res = await fetch("/api/expenses/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "AI error");
      applyAi(j.bill as AiBill);
      setAi({ busy: false, bill: j.bill, error: null });
    } catch (err) { setAi({ busy: false, bill: null, error: (err as Error).message }); }
  }

  function applyAi(b: AiBill) {
    const match = b.supplier_tax_id ? suppliers.find((s) => s.tax_id && s.tax_id === b.supplier_tax_id) : suppliers.find((s) => b.supplier_name && s.name.toLowerCase().replace(/\s/g, "").includes(b.supplier_name.toLowerCase().replace(/\s/g, "").slice(0, 10)));
    if (match) pickSupplier(match);
    else setSup({ id: null, name: b.supplier_name ?? "", tax_id: b.supplier_tax_id ?? "", address: b.supplier_address ?? "", branch: b.supplier_branch ?? "", is_company: b.supplier_is_company ?? true });
    if (b.bill_no) setBillNo(b.bill_no);
    if (b.bill_date) { setBillDate(b.bill_date); setPayRound(nextPayRound(b.bill_date)); }
    if (b.due_date) setDueDate(b.due_date);
    if (b.vat_mode) setVatMode(b.vat_mode);
    if (b.discount_amount) { setDiscPct(false); setDiscInput(String(Number(b.discount_amount))); }
    if (b.wht_pct) setWht(Number(b.wht_pct));
    if (b.notes) setDesc(b.notes.slice(0, 120));
    if (b.items?.length) setLines(b.items.map((it) => ({ key: crypto.randomUUID(), description: it.description ?? "", qty: Number(it.qty ?? 1) || 1, unit: it.unit ?? "", unit_price: Number(it.unit_price ?? (it.amount && it.qty ? it.amount / it.qty : it.amount ?? 0)) })));
  }

  const upd = (key: string, patch: Partial<Line>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addLine = () => setLines((l) => [...l, { key: crypto.randomUUID(), description: "", qty: 1, unit: "", unit_price: 0 }]);

  // same math as recalc_expense
  const sub = lines.reduce((a, l) => a + r2(l.qty * l.unit_price - lineDisc(l)), 0);
  const discount = discPct ? r2(sub * (parseFloat(discInput) || 0) / 100) : (parseFloat(discInput) || 0);
  const after = sub - discount;
  const net = vatMode === "inclusive" ? r2(after * 100 / 107) : after;
  const vat = vatMode === "inclusive" ? r2(after - net) : vatMode === "exclusive" ? r2(after * 0.07) : 0;
  const grand = vatMode === "exclusive" ? r2(net + vat) : after;
  const whtAmt = r2(net * wht / 100);
  const depRaw = depPct ? r2(grand * (parseFloat(deposit) || 0) / 100) : (parseFloat(deposit) || 0);
  const depAmt = depMode === "later" ? depRaw : 0;          // หักจากบิลนี้
  const firstDep = depMode === "first" ? depRaw : 0;         // มัดจำที่จะจ่ายรอบนี้
  const firstBad = depMode === "first" && firstDep > 0 && firstDep >= grand;
  const pay = r2(grand - whtAmt - depAmt);
  const firstWht = grand > 0 ? r2(whtAmt * firstDep / grand) : 0;
  const restDueEff = restDue || addDays(billDate, 30);
  const aiGrand = ai.bill?.grand_total != null ? Number(ai.bill.grand_total) : null;
  const mismatch = aiGrand != null && Math.abs(aiGrand - grand) > 0.5;

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6">
      {/* left: bill images + AI */}
      <div className="space-y-4">
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-display font-bold">รูปบิล</h2><span className="text-xs text-ink-soft">{files.length}/4</span></div>
          {files.map((f, i) => (
            <div key={f.path} className="relative group">
              {f.path.endsWith(".pdf") ? <a href={f.url} target="_blank" className="block rounded-xl bg-lavender/30 p-4 text-sm text-purple">📄 {f.name}</a>
                : /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.url} alt="" className="w-full rounded-xl border border-line" />}
              {!e && <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow opacity-0 group-hover:opacity-100"><X size={14} /></button>}
            </div>
          ))}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(ev) => onFiles(ev.target.files)} />
          {!e && files.length < 4 && <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-outline w-full"><Camera size={16} /> {uploading ? "กำลังอัปโหลด…" : files.length ? "เพิ่มรูป" : "ถ่าย / เลือกรูปบิล"}</button>}
          {!e && <p className="text-[11px] text-ink-soft text-center">ถ่ายจากมือถือได้ · รองรับ PDF · {aiEnabled ? "AI จะอ่านและกรอกให้ทันที" : "แนบรูปไว้เป็นหลักฐาน แล้วกรอกรายการด้านขวา"}</p>}
        </div>

        {(ai.busy || ai.bill || ai.error) && (
          <div className={`card p-4 space-y-2 text-sm ${ai.error ? "border-red/40" : ""}`}>
            <div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-purple" /> AI อ่านบิล {ai.busy && <span className="text-xs text-ink-soft font-normal">กำลังอ่าน…</span>}</div>
            {ai.error && <div className="text-red text-xs">{ai.error}</div>}
            {ai.bill && (
              <>
                <div className="text-xs text-ink-soft">{ai.bill.handwritten ? "บิลเขียนมือ — " : ""}ความมั่นใจ {Math.round((ai.bill.confidence ?? 0) * 100)}% · ยอดตามบิล {aiGrand != null ? fmt(aiGrand) : "—"}{ai.bill.net_pay != null ? ` · จ่ายจริง ${fmt(Number(ai.bill.net_pay))}` : ""}</div>
                {mismatch && <div className="rounded-lg bg-yellow/15 text-[#8a6a00] text-xs px-3 py-2 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />ยอดที่คำนวณจากรายการ ({fmt(grand)}) ไม่ตรงกับยอดในบิล ({fmt(aiGrand!)}) — ตรวจรายการ/VAT/ส่วนลดอีกครั้ง</div>}
                {(ai.bill.warnings ?? []).map((w, i) => <div key={i} className="text-xs text-[#8a6a00]">⚠ {w}</div>)}
                {files.length > 0 && <button type="button" onClick={() => runAi(files.map((f) => f.path))} className="text-xs text-purple">อ่านใหม่</button>}
              </>
            )}
          </div>
        )}
        {!ai.bill && !ai.busy && aiEnabled && files.length > 0 && !e && <button type="button" onClick={() => runAi(files.map((f) => f.path))} className="btn-ghost w-full"><Sparkles size={16} /> ให้ AI อ่านบิล</button>}
      </div>

      {/* right: form */}
      <div className="space-y-5">
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="supplier_id" value={sup.id ?? ""} />
        <input type="hidden" name="items" value={JSON.stringify(lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description, qty: l.qty, unit: l.unit || null, unit_price: l.unit_price, discount: lineDisc(l), product_id: l.product_id ?? null, material_id: l.material_id ?? null })))} />
        <input type="hidden" name="files" value={JSON.stringify(files.map((f) => ({ path: f.path, kind: "bill" })))} />
        <input type="hidden" name="ai_json" value={ai.bill ? JSON.stringify(ai.bill) : ""} />

        <div className="card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">บริษัทที่จ่าย</label><select value={companyId} onChange={(ev) => setCompanyId(ev.target.value)} className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}</select></div>
            <div><label className="label">หมวดค่าใช้จ่าย</label><select name="category_id" value={categoryId} onChange={(ev) => onCategory(ev.target.value)} className="input"><option value="">— เลือก —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}{Number(c.wht_pct) ? ` (หัก ${c.wht_pct}%)` : ""}</option>)}</select></div>
          </div>
          <div className="relative">
            <label className="label">ซัพพลายเออร์ / ผู้รับเงิน</label>
            <div className="flex gap-2">
              <input name="supplier_name" value={sup.name} onChange={(ev) => setSup({ ...sup, name: ev.target.value, id: null })} className="input" placeholder="ชื่อร้าน / บริษัท / บุคคล" required />
              <div className="relative w-56 shrink-0"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={sq} onChange={(ev) => setSq(ev.target.value)} className="input pl-8" placeholder="ค้นสมุดรายชื่อ" />
                {supResults.length > 0 && <div className="absolute z-10 right-0 mt-1 w-80 card p-1 max-h-60 overflow-auto">{supResults.map((c) => <button key={c.id} type="button" onClick={() => pickSupplier(c)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{c.name}<div className="text-[11px] text-ink-soft">{c.tax_id}</div></button>)}</div>}</div>
            </div>
            {sup.id && <p className="text-[11px] text-green mt-1">✓ ผูกกับสมุดรายชื่อแล้ว</p>}
          </div>
          <div className="grid sm:grid-cols-[1fr_110px_1fr] gap-4">
            <div><label className="label">เลขผู้เสียภาษี</label><input name="supplier_tax_id" value={sup.tax_id} onChange={(ev) => setSup({ ...sup, tax_id: ev.target.value })} className="input" /></div>
            <div><label className="label">สาขา</label><input name="supplier_branch" value={sup.branch} onChange={(ev) => setSup({ ...sup, branch: ev.target.value })} className="input" placeholder="00000" /></div>
            <div><label className="label">ประเภทผู้รับเงิน (แบบหัก ณ ที่จ่าย)</label>
              <select name="supplier_type" value={sup.is_company ? "company" : "person"} onChange={(ev) => setSup({ ...sup, is_company: ev.target.value === "company" })} className="input">
                <option value="person">บุคคลธรรมดา — ภ.ง.ด.3</option>
                <option value="company">นิติบุคคล (บริษัท/หจก.) — ภ.ง.ด.53</option>
              </select></div>
          </div>
          <div><label className="label">ที่อยู่ผู้รับเงิน</label><input name="supplier_address" value={sup.address} onChange={(ev) => setSup({ ...sup, address: ev.target.value })} className="input" /></div>
          <div className="grid sm:grid-cols-4 gap-4">
            <div><label className="label">เลขที่บิล</label><input name="bill_no" value={billNo} onChange={(ev) => setBillNo(ev.target.value)} className="input" /></div>
            <div><label className="label">วันที่บิล</label><input type="date" name="bill_date" value={billDate} onChange={(ev) => { setBillDate(ev.target.value); setPayRound(nextPayRound(ev.target.value)); }} className="input" required /></div>
            <div><label className="label">ครบกำหนด</label><input type="date" name="due_date" value={dueDate} onChange={(ev) => setDueDate(ev.target.value)} className="input" /></div>
            <div><label className="label">รอบจ่าย (1 / 15)</label><input type="date" name="pay_round" value={payRound} onChange={(ev) => setPayRound(ev.target.value)} className="input" /></div>
          </div>
          <div><label className="label">รายละเอียดสั้นๆ</label><input name="description" value={desc} onChange={(ev) => setDesc(ev.target.value)} className="input" placeholder="เช่น ค่าจ้างเย็บกระเป๋า ล็อต ก.ย." /></div>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display font-bold">รายการ</h2>
            <div className="flex items-center gap-2">
              <div className="relative w-72"><Search size={14} className="absolute left-3 top-3 text-ink-soft" />
                <input value={pq} onChange={(ev) => setPq(ev.target.value)} className="input pl-8" placeholder="ค้นหาสินค้า / ลายผ้า / แพคเกจจิ้ง…" />
                {prodResults.length > 0 && <div className="absolute z-10 right-0 mt-1 w-96 card p-1 max-h-64 overflow-auto">{prodResults.map((r) => <button key={r.kind + r.id} type="button" onClick={() => addCatalog(r)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{r.label}<div className="text-[11px] text-ink-soft">{r.sub} · หน่วย {r.unit}</div></button>)}</div>}</div>
              <button type="button" onClick={addLine} className="btn-ghost text-xs"><Plus size={14} /> บรรทัดว่าง</button>
            </div>
          </div>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th className="w-[50%] min-w-[340px]">รายละเอียด</th><th className="text-right">จำนวน</th><th>หน่วย</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">ส่วนลด</th><th className="text-right">จำนวนเงิน</th><th></th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.key}>
                <td className="min-w-[340px]"><textarea value={l.description} onChange={(ev) => upd(l.key, { description: ev.target.value })} rows={Math.min(5, Math.max(1, Math.ceil(l.description.length / 45), l.description.split("\n").length))} className="input resize-y leading-snug" />{(l.product_id || l.material_id) && <div className="text-[10px] text-green mt-0.5">✓ ผูกกับ{l.product_id ? "สินค้า" : "วัสดุ"}ในคลัง</div>}</td>
                <td><input type="number" step="0.01" value={l.qty} onChange={(ev) => upd(l.key, { qty: Number(ev.target.value) })} className="input text-right w-20" /></td>
                <td><input value={l.unit} onChange={(ev) => upd(l.key, { unit: ev.target.value })} className="input w-16" placeholder="ชิ้น" /></td>
                <td><input type="number" step="0.01" value={l.unit_price} onChange={(ev) => upd(l.key, { unit_price: Number(ev.target.value) })} className="input text-right w-24" /></td>
                <td><input value={l.disc ?? ""} onChange={(ev) => upd(l.key, { disc: ev.target.value })} className="input text-right w-20" placeholder="0 / 10%" title="ใส่เป็นบาท เช่น 15 หรือเป็น % เช่น 10%" />{(l.disc ?? "").trim().endsWith("%") && lineDisc(l) > 0 && <div className="text-[10px] text-ink-soft text-right">= {fmt(lineDisc(l))}</div>}</td>
                <td className="text-right font-semibold whitespace-nowrap">{lineDisc(l) > 0 && <div className="text-[10px] text-ink-soft line-through font-normal">{fmt(r2(l.qty * l.unit_price))}</div>}{fmt(r2(l.qty * l.unit_price - lineDisc(l)))}</td>
                <td><button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} className="text-ink-soft hover:text-red"><Trash2 size={14} /></button></td>
              </tr>))}
              {!lines.length && <tr><td colSpan={7} className="text-center text-ink-soft py-6">ยังไม่มีรายการ — ค้นหาสินค้าด้านบน หรือกด “บรรทัดว่าง”</td></tr>}
            </tbody></table></div>
        </div>

        <div className="grid md:grid-cols-[1fr_300px] gap-5">
          <div className="card p-5 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div><label className="label">VAT</label><select name="vat_mode" value={vatMode} onChange={(ev) => setVatMode(ev.target.value as VatMode)} className="input"><option value="none">ไม่มี VAT (บิลเงินสด)</option><option value="exclusive">ใบกำกับภาษี — ราคาก่อน VAT (+7%)</option><option value="inclusive">ใบกำกับภาษี — ราคารวม VAT</option></select></div>
              <div><label className="label flex items-center gap-1.5">ส่วนลดท้ายบิล <span className="inline-flex rounded-md border border-line text-[11px] overflow-hidden">{(["฿", "%"] as const).map((m) => <button key={m} type="button" onClick={() => setDiscPct(m === "%")} className={`px-1.5 ${(m === "%") === discPct ? "bg-purple text-white" : ""}`}>{m}</button>)}</span></label>
                <input type="number" step="0.01" value={discInput} onChange={(ev) => setDiscInput(ev.target.value)} className="input" placeholder="0" />
                <input type="hidden" name="discount_amount" value={discount} />{discPct && discount > 0 && <div className="text-[11px] text-ink-soft mt-0.5">= {fmt(discount)} บาท</div>}</div>
              <div><label className="label">หัก ณ ที่จ่าย %</label><select name="wht_pct" value={wht} onChange={(ev) => setWht(Number(ev.target.value))} className="input">{WHT_CHOICES.map((w) => <option key={w} value={w}>{w === 0 ? "ไม่หัก" : `${w}%`}</option>)}</select></div>
            </div>
            <div className="rounded-xl border border-line p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><span className="label !mb-0">มัดจำ</span>
                {([["none", "ไม่มีมัดจำ"], ...(splitLocked ? [] : [["first", "จ่ายมัดจำรอบนี้ (รอบแรก)"]]), ["later", "หักมัดจำที่จ่ายไปแล้ว (รอบหลัง)"]] as [typeof depMode, string][]).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setDepMode(k)} className={`text-xs rounded-full border px-3 py-1 ${depMode === k ? "bg-purple text-white border-purple" : "border-line"}`}>{t}</button>
                ))}
              </div>
              {hadDeposit && <input type="hidden" name="deposit_had" value="1" />}
              <input type="hidden" name="deposit_amount" value={depAmt} />
              {depMode !== "none" && (
                <div className="grid sm:grid-cols-3 gap-4">
                  <div><label className="label flex items-center gap-1.5">{depMode === "first" ? "มัดจำที่จะจ่ายรอบนี้" : "มัดจำที่จ่ายไปแล้ว"} <span className="inline-flex rounded-md border border-line text-[11px] overflow-hidden">{(["฿", "%"] as const).map((m) => <button key={m} type="button" onClick={() => setDepPct(m === "%")} className={`px-1.5 ${(m === "%") === depPct ? "bg-purple text-white" : ""}`}>{m}</button>)}</span></label>
                    <input type="number" step="0.01" min="0" value={deposit} onChange={(ev) => setDeposit(ev.target.value)} className="input" placeholder={depPct ? "เช่น 50" : "0"} />
                    {depPct && depRaw > 0 && <div className="text-[11px] text-ink-soft mt-0.5">= {fmt(depRaw)} บาท ({deposit}% ของยอดตามบิล)</div>}</div>
                  {depMode === "first" ? (<>
                    <div><label className="label">ส่วนที่เหลือครบกำหนดจ่าย</label><input type="date" value={restDueEff} onChange={(ev) => setRestDue(ev.target.value)} className="input" /><div className="text-[11px] text-ink-soft mt-0.5">ตามระยะเวลาผลิตของงานนี้</div></div>
                    <div className="text-[12px] text-ink-soft self-end">บันทึกแล้วระบบจะแยกเป็น 2 บิล: บิลนี้ = มัดจำ (จ่ายรอบนี้) · บิลใหม่ = ส่วนที่เหลือ รอจ่ายรอบ {thD(nextPayRound(restDueEff))}</div>
                    {firstDep > 0 && !firstBad && <><input type="hidden" name="split_deposit" value={firstDep} /><input type="hidden" name="split_due" value={restDueEff} /><input type="hidden" name="split_round" value={nextPayRound(restDueEff)} /></>}
                  </>) : (
                    <div className="sm:col-span-2"><label className="label">รายละเอียดมัดจำ</label><input name="deposit_note" value={depositNote} onChange={(ev) => setDepositNote(ev.target.value)} className="input" placeholder="เช่น มัดจำ 50% จ่ายแล้ววันที่ 1/11 · อ้างอิง EXP…" /></div>
                  )}
                </div>
              )}
              {depMode !== "later" && hadDeposit && <input type="hidden" name="deposit_note" value="" />}
              {firstBad && <div className="text-xs text-red">ยอดมัดจำต้องน้อยกว่ายอดตามบิล</div>}
            </div>
            <div><label className="label">หมายเหตุภายใน</label><textarea name="note" value={note} onChange={(ev) => setNote(ev.target.value)} className="input" rows={2} /></div>
          </div>
          <div className="card p-5 text-sm space-y-1.5">
            <Row l="รวมรายการ" v={sub} />
            {discount > 0 && <Row l="ส่วนลด" v={-discount} />}
            {vatMode !== "none" && <><Row l="มูลค่าก่อน VAT" v={net} /><Row l="VAT 7%" v={vat} /></>}
            <Row l="ยอดตามบิล" v={grand} bold />
            {wht > 0 && <Row l={`หัก ณ ที่จ่าย ${wht}%`} v={-whtAmt} red />}
            {depAmt > 0 && <Row l="หักมัดจำที่จ่ายแล้ว" v={-depAmt} red />}
            <div className="border-t border-line pt-2 mt-2 flex justify-between items-baseline"><span className="font-semibold">ยอดจ่ายจริง{firstDep > 0 && !firstBad ? "ทั้งงาน" : ""}</span><span className="font-display text-xl font-bold text-purple">{fmt(pay)}</span></div>
            {firstDep > 0 && !firstBad && <div className="mt-2 rounded-lg bg-purple/5 p-2 space-y-1">
              <Row l="จ่ายมัดจำรอบนี้" v={r2(firstDep - firstWht)} bold />
              <Row l={`ส่วนที่เหลือ (ครบ ${thD(restDueEff)})`} v={r2(pay - (firstDep - firstWht))} />
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
function Row({ l, v, bold, red }: { l: string; v: number; bold?: boolean; red?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${red ? "text-red" : ""}`}><span className="text-ink-soft">{l}</span><span>{v < 0 ? `−${fmt(-v)}` : fmt(v)}</span></div>;
}

function addDays(d: string, n: number) { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function thD(d: string) { return `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}/${Number(d.slice(0, 4)) + 543}`; }
