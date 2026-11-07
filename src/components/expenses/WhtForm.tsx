"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Company } from "@/lib/sales/types";
import type { Contact } from "@/lib/stock/types";
import { WHT_ROWS, PAYER_CONDITIONS } from "./WhtSheet";
import { todayBkk } from "@/lib/today";

type SupplierLite = Pick<Contact, "id" | "name" | "tax_id" | "address" | "address2" | "address3" | "postcode" | "branch_code" | "entity_type"> & { default_wht_pct?: number | null };
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INCOME_PRESETS = ["ค่าจ้างทำของ", "ค่าบริการ", "ค่าโฆษณา", "ค่าเช่า", "ค่าขนส่ง", "ค่าจ้างทำบัญชี", "ค่าที่ปรึกษา / วิชาชีพอิสระ"];

export function WhtForm({ companies, suppliers, defaults }: { companies: Company[]; suppliers: SupplierLite[]; defaults?: { expense_id?: string; payee_name?: string; payee_tax_id?: string; payee_address?: string; payee_branch?: string; form?: "pnd3" | "pnd53"; amount?: number; pct?: number; income_type?: string; pay_date?: string } }) {
  const d = defaults ?? {};
  const [today] = useState(() => todayBkk());
  const [companyId, setCompanyId] = useState(companies.find((c) => c.code === "PKM")?.id ?? companies[0]?.id);
  const [payee, setPayee] = useState({ name: d.payee_name ?? "", tax_id: d.payee_tax_id ?? "", address: d.payee_address ?? "", branch: d.payee_branch ?? "", form: d.form ?? "pnd53" });
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState(d.amount ?? 0);
  const [pct, setPct] = useState(d.pct ?? 3);
  const [row, setRow] = useState(5);
  const [incomeType, setIncomeType] = useState(d.income_type ?? "ค่าบริการ");
  const wht = Math.round(amount * pct) / 100;
  const results = useMemo(() => { const s = q.trim().toLowerCase(); return s ? suppliers.filter((c) => c.name.toLowerCase().includes(s) || (c.tax_id ?? "").includes(s)).slice(0, 8) : []; }, [q, suppliers]);
  function pick(c: SupplierLite) {
    setPayee({ name: c.name, tax_id: c.tax_id ?? "", address: [c.address, c.address2, c.address3, c.postcode].filter(Boolean).join(" "), branch: c.branch_code ?? "", form: c.entity_type === "บุคคลธรรมดา" ? "pnd3" : "pnd53" });
    if (c.default_wht_pct) setPct(Number(c.default_wht_pct));
    setQ("");
  }
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      {d.expense_id && <input type="hidden" name="expense_id" value={d.expense_id} />}
      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">บริษัทผู้หักภาษี</label><select name="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}</select></div>
          <div><label className="label">วันที่จ่ายเงิน</label><input type="date" name="pay_date" defaultValue={d.pay_date ?? today} className="input" required /></div>
        </div>
        <div>
          <label className="label">ผู้ถูกหักภาษี ณ ที่จ่าย</label>
          <div className="flex gap-2">
            <input name="payee_name" value={payee.name} onChange={(e) => setPayee({ ...payee, name: e.target.value })} className="input" placeholder="ชื่อบุคคล / บริษัท" required />
            <div className="relative w-56 shrink-0"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-8" placeholder="ค้นสมุดรายชื่อ" />
              {results.length > 0 && <div className="absolute z-10 right-0 mt-1 w-80 card p-1 max-h-60 overflow-auto">{results.map((c) => <button key={c.id} type="button" onClick={() => pick(c)} className="block w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-cream">{c.name}<div className="text-[11px] text-ink-soft">{c.tax_id}</div></button>)}</div>}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-[1fr_110px_1fr] gap-4">
          <div><label className="label">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label><input name="payee_tax_id" value={payee.tax_id} onChange={(e) => setPayee({ ...payee, tax_id: e.target.value })} className="input" /></div>
          <div><label className="label">สาขา</label><input name="payee_branch" value={payee.branch} onChange={(e) => setPayee({ ...payee, branch: e.target.value })} className="input" placeholder="สำนักงานใหญ่" /></div>
          <div><label className="label">แบบยื่น</label><select name="form" value={payee.form} onChange={(e) => setPayee({ ...payee, form: e.target.value as "pnd3" | "pnd53" })} className="input"><option value="pnd3">บุคคลธรรมดา — ภ.ง.ด.3</option><option value="pnd53">นิติบุคคล — ภ.ง.ด.53</option></select></div>
        </div>
        <div><label className="label">ที่อยู่</label><input name="payee_address" value={payee.address} onChange={(e) => setPayee({ ...payee, address: e.target.value })} className="input" /></div>
        <div><label className="label">ประเภทเงินได้ (ข้อบนฟอร์ม)</label>
          <select name="income_row" value={row} onChange={(e) => setRow(Number(e.target.value))} className="input">{WHT_ROWS.map((r) => <option key={r.row} value={r.row}>{r.label.length > 90 ? r.label.slice(0, 90) + "…" : r.label}</option>)}</select></div>
        <div><label className="label">ระบุรายละเอียด</label>
          <input name="income_type" list="income-presets" value={incomeType} onChange={(e) => setIncomeType(e.target.value)} className="input" placeholder="เช่น ค่าจ้างทำบัญชี" />
          <datalist id="income-presets">{INCOME_PRESETS.map((p) => <option key={p} value={p} />)}</datalist></div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className="label">จำนวนเงินที่จ่าย (ก่อน VAT)</label><input type="number" step="0.01" name="income_amount" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" required /></div>
          <div><label className="label">อัตราหัก %</label><input type="number" step="0.5" name="wht_pct" value={pct} onChange={(e) => setPct(Number(e.target.value))} className="input" /></div>
          <div><label className="label">ภาษีที่หัก (แก้ได้)</label><input type="number" step="0.01" name="wht_amount" defaultValue={wht} key={wht} className="input" /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">ผู้จ่ายเงิน</label><select name="payer_condition" defaultValue={1} className="input">{PAYER_CONDITIONS.map((p, i) => <option key={p} value={i + 1}>{p}</option>)}</select></div>
          <div><label className="label">หมายเหตุภายใน</label><input name="note" className="input" /></div>
        </div>
      </div>
      <div className="card p-5 text-sm space-y-2 h-fit">
        <div className="flex justify-between"><span className="text-ink-soft">จำนวนเงินที่จ่าย</span><b>{fmt(amount)}</b></div>
        <div className="flex justify-between"><span className="text-ink-soft">หัก {pct}%</span><b className="text-red">{fmt(wht)}</b></div>
        <div className="flex justify-between border-t border-line pt-2"><span>จ่ายสุทธิ</span><b className="text-purple font-display text-lg">{fmt(amount - wht)}</b></div>
        <p className="text-xs text-ink-soft pt-2">เลขที่จะออกอัตโนมัติ WT+ปีเดือน+ลำดับ (เช่น WT2026110001) พิมพ์ได้ 4 ฉบับตามแบบสรรพากร</p>
      </div>
    </div>
  );
}
