"use client";

import { useMemo, useState, useTransition } from "react";
import { Upload, Search, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import type { Company, VatMode, SalesChannel } from "@/lib/sales/types";
import type { Contact } from "@/lib/stock/types";
import { parseStoreReport, blockFromPdfRows, FORMAT_HINT, type ParsedReport, type StoreBlock, type PdfParsed } from "@/lib/sales/store-report";
import { createStoreReportDocs, parseStoreReportPdf, type StoreDocInput } from "@/app/(app)/sales/actions";

type ContactLite = Pick<Contact, "id" | "name" | "code" | "tax_id" | "address" | "address2" | "address3" | "postcode" | "branch_code" | "credit_days"> & { default_discount_pct?: number | null; default_vat_mode?: VatMode | null; default_channel?: SalesChannel | null };
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const lastDay = (iso: string) => { const d = new Date(iso + "T00:00:00"); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };

interface BlockState { contact: ContactLite | null; gpPct: number; docDate: string; poNo: string; skip: boolean; q: string }

export function StoreReportImport({ companies, customers }: { companies: Company[]; customers: ContactLite[] }) {
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id);
  const [docType, setDocType] = useState<"invoice" | "receipt">("invoice");
  const [states, setStates] = useState<Record<string, BlockState>>({});
  const [result, setResult] = useState<{ ok: { key: string; doc_no: string; id: string; grand: number }[]; errors: { key: string; message: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const [pdf, setPdf] = useState<PdfParsed | null>(null);
  const [pdfMap, setPdfMap] = useState<{ qty: number; net: number; gross: number | null; store: string }>({ qty: 0, net: -1, gross: null, store: "" });
  const [parsing, setParsing] = useState(false);

  function applyReport(r: ParsedReport, name: string) {
    setReport(r); setFileName(name);
    const st: Record<string, BlockState> = {};
    for (const b of r.blocks) {
      const guess = customers.find((c) => b.storeCode && (c.code ?? "").toUpperCase() === b.storeCode.toUpperCase())
        ?? customers.find((c) => c.name.toLowerCase().includes(b.storeName.toLowerCase().split(" ").filter((w) => w.length > 3)[0] ?? "§§"));
      st[b.key] = { contact: guess ?? null, gpPct: b.gpPct ?? Number(guess?.default_discount_pct ?? 0), docDate: lastDay(b.periodTo || new Date().toISOString().slice(0, 10)), poNo: "", skip: false, q: "" };
    }
    setStates(st);
  }
  function applyPdf(p: PdfParsed, map: typeof pdfMap, name: string) {
    applyReport(blockFromPdfRows(p, map.qty, map.net, map.gross, map.store), name);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(null); setResult(null); setPdf(null);
    if (f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf") {
      setParsing(true);
      const fd = new FormData(); fd.set("pdf", f);
      const r = await parseStoreReportPdf(fd);
      setParsing(false);
      if (r.error || !r.parsed) { setReport(null); setErr(r.error ?? "อ่านไม่ได้"); return; }
      // default guess: first integer-looking column = qty, last number = net
      const first = r.parsed.rows[0];
      const qtyIdx = Math.max(0, first.numbers.findIndex((n) => Number.isInteger(n) && n > 0 && n < 10000));
      const guessStore = r.parsed.headerLines.find((l) => /ห้าง|บริษัท|สาขา|store|shop|branch/i.test(l)) ?? "";
      const map = { qty: qtyIdx, net: -1, gross: null, store: guessStore.slice(0, 80) };
      setPdf(r.parsed); setPdfMap(map); applyPdf(r.parsed, map, f.name);
      return;
    }
    try {
      const r = parseStoreReport(await f.arrayBuffer());
      applyReport(r, f.name); return;
    } catch (e) { setReport(null); setErr(e instanceof Error ? e.message : String(e)); }
  }
  const upd = (key: string, patch: Partial<BlockState>) => setStates((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  function submit() {
    if (!report) return;
    const inputs: StoreDocInput[] = report.blocks.filter((b) => !states[b.key].skip).map((b) => {
      const s = states[b.key];
      return {
        key: b.key, company_id: companyId!, doc_type: docType, contact_id: s.contact?.id ?? null,
        customer_name: s.contact?.name ?? b.storeName, customer_tax_id: s.contact?.tax_id ?? null, customer_branch: s.contact?.branch_code ?? null,
        customer_address: s.contact ? [s.contact.address, s.contact.address2, s.contact.address3, s.contact.postcode].filter(Boolean).join(" ") : null,
        doc_date: s.docDate, po_no: s.poNo || null, gp_pct: s.gpPct, vendor_amount: b.vendor,
        period_from: b.periodFrom, period_to: b.periodTo, store_code: b.storeCode, store_name: b.storeName, format: report.format, file_name: fileName,
        lines: b.lines.map((l) => ({ barcode: l.barcode, code: l.code, description: l.description, qty: l.qty, net: l.net, gross: l.gross })),
      };
    });
    start(async () => { setResult(await createStoreReportDocs(inputs)); });
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className="label">บริษัทผู้ออกเอกสาร</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}</select></div>
          <div><label className="label">ประเภทเอกสาร</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value as "invoice" | "receipt")} className="input"><option value="invoice">ใบส่งของ / ใบกำกับภาษี (วางบิลห้าง)</option><option value="receipt">ใบเสร็จรับเงิน / ใบกำกับภาษี (ห้างโอนแล้ว)</option></select></div>
          <div><label className="label">ไฟล์รายงานจากห้าง (.xlsx / .pdf)</label>
            <label className="input flex items-center gap-2 cursor-pointer"><Upload size={16} className="text-purple" /><span className="truncate text-sm">{parsing ? "กำลังอ่าน PDF…" : fileName || "เลือกไฟล์…"}</span>
              <input type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label></div>
        </div>
        <p className="text-xs text-ink-soft">{FORMAT_HINT}</p>
        {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{err}</div>}
      </div>

      {report && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="badge-ok inline-flex items-center gap-1"><FileSpreadsheet size={14} /> {report.formatLabel}</span>
            <span className="text-ink-soft">พบ {report.blocks.length} สาขา · {report.blocks.reduce((a, b) => a + b.rows, 0).toLocaleString()} แถว</span>
          </div>
          {pdf && (
            <div className="card p-5 space-y-3">
              <div className="font-semibold text-sm">PDF: พบ {pdf.rows.length} บรรทัดที่มีบาร์โค้ด · เลือกว่าตัวเลขคอลัมน์ไหนคือ จำนวน และ ยอดสุทธิ</div>
              <div className="grid sm:grid-cols-4 gap-3">
                <div><label className="label">ชื่อห้าง / สาขา</label><input value={pdfMap.store} onChange={(e) => { const m = { ...pdfMap, store: e.target.value }; setPdfMap(m); applyPdf(pdf, m, fileName); }} className="input" placeholder="พิมพ์ชื่อห้าง" /></div>
                <ColSel label="คอลัมน์ จำนวน" value={pdfMap.qty} max={pdf.maxNumbers} onChange={(v) => { const m = { ...pdfMap, qty: v }; setPdfMap(m); applyPdf(pdf, m, fileName); }} />
                <ColSel label="คอลัมน์ ยอดสุทธิ (หลังส่วนลดหน้าร้าน)" value={pdfMap.net} max={pdf.maxNumbers} onChange={(v) => { const m = { ...pdfMap, net: v }; setPdfMap(m); applyPdf(pdf, m, fileName); }} />
                <ColSel label="คอลัมน์ ยอดเต็ม (ถ้ามี)" value={pdfMap.gross ?? 99} max={pdf.maxNumbers} allowNone onChange={(v) => { const m = { ...pdfMap, gross: v === 99 ? null : v }; setPdfMap(m); applyPdf(pdf, m, fileName); }} />
              </div>
              <div className="overflow-x-auto"><table className="tbl text-xs"><thead><tr><th>บาร์โค้ด</th><th>ข้อความ</th>{Array.from({ length: pdf.maxNumbers }).map((_, i) => <th key={i} className="text-right">เลข {i + 1}{i === pdf.maxNumbers - 1 ? " (สุดท้าย)" : ""}</th>)}</tr></thead>
                <tbody>{pdf.rows.slice(0, 5).map((r, i) => <tr key={i}><td className="font-mono">{r.barcode}</td><td>{r.text}</td>{Array.from({ length: pdf.maxNumbers }).map((_, j) => <td key={j} className="text-right">{r.numbers[j] ?? ""}</td>)}</tr>)}</tbody></table>
                <p className="text-[11px] text-ink-soft mt-1">แสดง 5 บรรทัดแรกเพื่อเทียบ — ถ้าคอลัมน์ไม่ตรง เลือกใหม่ด้านบน ตัวเลขด้านล่างจะอัปเดตทันที · ส่งตัวอย่าง PDF ให้ผู้ดูแลเพื่อให้ระบบจับอัตโนมัติในครั้งถัดไป</p></div>
            </div>
          )}
          {report.warnings.map((w) => <div key={w} className="rounded-xl bg-yellow/15 text-[#8a6a00] text-sm px-4 py-2 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{w}</div>)}

          {report.blocks.map((b) => <BlockCard key={b.key} b={b} s={states[b.key]} customers={customers} upd={(p) => upd(b.key, p)} done={result?.ok.find((o) => o.key === b.key)} error={result?.errors.find((o) => o.key === b.key)?.message} />)}

          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={pending || !!result?.ok.length} className="btn-primary">{pending ? "กำลังสร้าง…" : `สร้างฉบับร่าง ${report.blocks.filter((b) => !states[b.key]?.skip).length} ใบ`}</button>
            {result && result.ok.length > 0 && <a href={`/sales/docs?type=${docType}`} className="btn-ghost">ไปดูเอกสาร</a>}
          </div>
          <p className="text-xs text-ink-soft">สร้างเป็นฉบับร่างก่อน — เปิดดูแต่ละใบ ตรวจยอดกับห้าง แล้วค่อยกด “ออกเอกสาร” (ตัดสต็อกเมื่อออกใบส่งของ)</p>
        </>
      )}
    </div>
  );
}

function BlockCard({ b, s, customers, upd, done, error }: { b: StoreBlock; s: BlockState; customers: ContactLite[]; upd: (p: Partial<BlockState>) => void; done?: { doc_no: string; id: string; grand: number }; error?: string }) {
  const [open, setOpen] = useState(false);
  const results = useMemo(() => { const q = s.q.trim().toLowerCase(); return q ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? "").toLowerCase().includes(q)).slice(0, 8) : []; }, [s.q, customers]);
  const discount = b.vendor != null ? b.net - b.vendor : Math.round(b.net * s.gpPct) / 100;
  const total = b.net - discount;
  return (
    <div className={`card p-5 space-y-4 ${s.skip ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{b.storeName} {b.storeCode && <span className="text-ink-soft font-normal">· สาขา {b.storeCode}</span>}</div>
          <div className="text-xs text-ink-soft">ช่วงขาย {thDate(b.periodFrom)} – {thDate(b.periodTo)} · {b.lines.length} สินค้า · {b.lines.reduce((a, l) => a + l.qty, 0).toLocaleString()} ชิ้น</div>
        </div>
        {done ? <span className="badge-approved inline-flex items-center gap-1"><CheckCircle2 size={14} /> สร้างแล้ว <a className="underline" href={`/sales/docs/${done.id}`}>{done.doc_no}</a></span>
          : <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={s.skip} onChange={(e) => upd({ skip: e.target.checked })} /> ข้ามสาขานี้</label>}
      </div>
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-2">{error}</div>}

      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <label className="label">ลูกค้าในสมุดรายชื่อ (ออกเอกสารในชื่อนี้)</label>
          {s.contact ? (
            <div className="input flex items-center justify-between gap-2"><span className="truncate text-sm">{s.contact.name}{s.contact.branch_code ? ` (สาขา ${s.contact.branch_code})` : ""}</span>
              <button type="button" className="text-xs text-purple shrink-0" onClick={() => upd({ contact: null })}>เปลี่ยน</button></div>
          ) : (
            <div className="relative"><Search size={14} className="absolute left-3 top-3 text-ink-soft" />
              <input value={s.q} onChange={(e) => upd({ q: e.target.value })} placeholder="ค้นหาชื่อห้าง / รหัส…" className="input pl-8" />
              {results.length > 0 && <div className="absolute z-10 mt-1 w-full card p-1 max-h-60 overflow-auto">{results.map((c) => <button key={c.id} type="button" onClick={() => upd({ contact: c, q: "", gpPct: b.gpPct ?? Number(c.default_discount_pct ?? s.gpPct) })} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{c.name} <span className="text-xs text-ink-soft">{c.code} {c.branch_code ? `สาขา ${c.branch_code}` : ""}</span></button>)}</div>}
              <p className="text-[11px] text-ink-soft mt-1">ไม่เลือก = ใช้ชื่อจากไฟล์ “{b.storeName}”</p></div>
          )}
        </div>
        <div><label className="label">GP / ส่วนลดท้ายบิล %</label>
          <input type="number" step="0.01" min={0} max={100} value={s.gpPct} disabled={b.vendor != null} onChange={(e) => upd({ gpPct: Number(e.target.value) })} className="input" />
          {b.vendor != null && <p className="text-[11px] text-ink-soft mt-1">ล็อกตามไฟล์ห้าง — ยอดสุทธิตรง Final Vendor Amt</p>}</div>
        <div><label className="label">วันที่เอกสาร</label><input type="date" value={s.docDate} onChange={(e) => upd({ docDate: e.target.value })} className="input" /></div>
        <div className="md:col-span-2"><label className="label">เลข PO / อ้างอิงห้าง (ถ้ามี)</label><input value={s.poNo} onChange={(e) => upd({ poNo: e.target.value })} className="input" placeholder="เช่น PO ห้าง, เลขรายงาน" /></div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-xl bg-cream px-3 py-2"><div className="text-[11px] text-ink-soft">ยอดขายปลีก</div><div className="font-semibold">{fmt(b.gross)}</div></div>
        <div className="rounded-xl bg-cream px-3 py-2"><div className="text-[11px] text-ink-soft">หลังส่วนลดหน้าร้าน</div><div className="font-semibold">{fmt(b.net)}</div></div>
        <div className="rounded-xl bg-cream px-3 py-2"><div className="text-[11px] text-ink-soft">หัก GP {s.gpPct}%</div><div className="font-semibold text-red">−{fmt(discount)}</div></div>
        <div className="rounded-xl bg-purple text-white px-3 py-2"><div className="text-[11px] opacity-80">ยอดที่ห้างต้องจ่าย (รวม VAT)</div><div className="font-semibold">{fmt(total)}</div></div>
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-purple">{open ? "ซ่อนรายการ" : `ดูรายการสินค้า (${b.lines.length})`}</button>
      {open && (
        <div className="overflow-x-auto"><table className="tbl text-xs"><thead><tr><th>บาร์โค้ด</th><th>สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">ราคาปลีก</th><th className="text-right">ส่วนลดหน้าร้าน</th><th className="text-right">สุทธิ</th></tr></thead>
          <tbody>{b.lines.map((l) => <tr key={l.barcode ?? l.code ?? l.description}><td className="font-mono">{l.barcode ?? l.code ?? "—"}</td><td>{l.description}</td><td className="text-right">{l.qty}</td><td className="text-right">{fmt(l.gross / l.qty)}</td><td className="text-right">{l.gross !== l.net ? `−${fmt(l.gross - l.net)}` : "—"}</td><td className="text-right font-semibold">{fmt(l.net)}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function ColSel({ label, value, max, onChange, allowNone }: { label: string; value: number; max: number; onChange: (v: number) => void; allowNone?: boolean }) {
  return (
    <div><label className="label">{label}</label>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="input">
        {allowNone && <option value={99}>— ไม่ใช้ —</option>}
        <option value={-1}>เลขสุดท้ายของบรรทัด</option>
        <option value={-2}>เลขรองสุดท้าย</option>
        {Array.from({ length: max }).map((_, i) => <option key={i} value={i}>เลขที่ {i + 1}</option>)}
      </select></div>
  );
}
