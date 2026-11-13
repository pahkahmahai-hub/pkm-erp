import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui";
import { requirePayroll, loadPayrollSettings } from "@/lib/payroll/server";
import { money, periodLabel, TAX_METHOD_TH, type PayrollLine, type PayrollRun, type TaxMethod } from "@/lib/payroll/calc";
import { savePayrollLine } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PayrollLineEdit({ params, searchParams }: { params: Promise<{ runId: string; lineId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { runId, lineId } = await params; const sp = await searchParams;
  const { sb } = await requirePayroll(`/hr/payroll/${runId}/${lineId}`);
  const s = await loadPayrollSettings(sb);
  const [{ data: run }, { data: line }] = await Promise.all([sb.from("payroll_runs").select("*").eq("id", runId).maybeSingle(), sb.from("payroll_lines").select("*").eq("id", lineId).maybeSingle()]);
  if (!run || !line) notFound();
  const r = run as PayrollRun; const l = line as PayrollLine; const ro = r.status !== "draft";
  const { data: e } = await sb.from("employees").select("emp_code, first_name, last_name, nickname").eq("id", l.employee_id).maybeSingle();
  const N = ({ name, label, step = "0.01", hint }: { name: keyof PayrollLine; label: string; step?: string; hint?: string }) => (
    <div><label className="label">{label}</label><input name={name} type="number" step={step} defaultValue={Number(l[name] ?? 0)} className="input" disabled={ro} />{hint && <p className="text-[11px] text-ink-soft mt-0.5">{hint}</p>}</div>
  );
  const Row = ({ k, v, neg, bold }: { k: string; v: number; neg?: boolean; bold?: boolean }) => <div className={`flex justify-between ${bold ? "font-bold" : ""}`}><span>{k}</span><span className={neg && v ? "text-red" : ""}>{neg && v ? "−" : ""}{money(v)}</span></div>;
  return (
    <div className="space-y-4">
      <Header crumbs={[{ href: "/hr", label: "HR" }, { href: "/hr/payroll", label: "PAYROLL" }, { href: `/hr/payroll/${runId}`, label: periodLabel(r.period) }]} title={`${e?.first_name ?? ""} ${e?.last_name ?? ""}${e?.nickname ? ` (${e.nickname})` : ""}`} sub={`${e?.emp_code ?? ""} · ค่าแรง/ชม. ${money(l.hourly_rate)} · ${ro ? "งวดปิดแล้ว (ดูอย่างเดียว)" : "แก้แล้วกดบันทึก ระบบคำนวณใหม่ให้"}`} />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        <form action={savePayrollLine.bind(null, lineId, runId)} className="card p-5 space-y-5">
          <fieldset disabled={ro} className="space-y-5">
            <div><h3 className="font-display font-bold mb-2">รายได้</h3><div className="grid sm:grid-cols-3 gap-3">
              <N name="salary" label="เงินเดือน" /><N name="position_allowance" label="ค่าตำแหน่ง" /><N name="hourly_rate" label="ค่าแรง/ชม. (OT/สาย)" />
              <N name="ot_hours_weekday" label={`OT วันทำงาน (ชม.) ×${s.ot_weekday_mult}`} step="0.5" /><N name="ot_hours_holiday1" label={`ทำงานวันหยุด (ชม.) ×${s.holiday_work_mult}`} step="0.5" /><N name="ot_hours_holiday3" label={`OT วันหยุด (ชม.) ×${s.ot_holiday_mult}`} step="0.5" />
              <N name="commission_sales" label="ยอดขายคิดคอมฯ" hint="ใส่ยอดขาย + % → คำนวณคอมฯ ให้" /><N name="commission_rate" label="คอมมิชชั่น %" step="0.001" /><N name="commission_amount" label="คอมมิชชั่น (บาท)" hint="ถ้ายอดขาย = 0 ใช้ตัวเลขที่กรอกนี้" />
              <N name="diligence" label="เบี้ยขยัน" /><N name="bonus" label="โบนัส" /><N name="other_income" label="รายได้อื่น" />
              <div className="sm:col-span-3"><label className="label">รายได้อื่น — รายละเอียด</label><input name="other_income_note" defaultValue={l.other_income_note ?? ""} className="input" placeholder="เช่น ค่าเดินทาง, ค่าโทรศัพท์" /></div>
            </div></div>
            <div><h3 className="font-display font-bold mb-2">รายการหัก</h3><div className="grid sm:grid-cols-3 gap-3">
              <div><N name="late_minutes" label="มาสาย (นาที)" step="1" /><label className="flex items-center gap-2 text-sm mt-1.5"><input type="checkbox" name="deduct_late" defaultChecked={l.deduct_late !== false} className="accent-purple" /> หักเงินมาสาย</label></div><div><N name="absent_days" label="ขาดงาน (วัน)" step="0.5" /><label className="flex items-center gap-2 text-sm mt-1.5"><input type="checkbox" name="deduct_absence" defaultChecked={l.deduct_absence !== false} className="accent-purple" /> หักเงินขาดงาน/ลาไม่รับเงิน</label></div><N name="unpaid_leave_days" label="ลาไม่รับค่าจ้าง (วัน)" step="0.5" />
              <N name="advance" label="เบิกล่วงหน้า" /><N name="other_deduct" label="หักอื่นๆ" />
              <div><label className="label">หักอื่นๆ — รายละเอียด</label><input name="other_deduct_note" defaultValue={l.other_deduct_note ?? ""} className="input" /></div>
            </div></div>
            <div><h3 className="font-display font-bold mb-2">ประกันสังคม และภาษี</h3>
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sso_on" defaultChecked={l.sso_on} className="accent-purple" /> หักประกันสังคมงวดนี้</label>
                <div><label className="label">วิธีหักภาษี</label><select name="tax_method" defaultValue={l.tax_method} className="input">{(Object.keys(TAX_METHOD_TH) as TaxMethod[]).map((k) => <option key={k} value={k}>{TAX_METHOD_TH[k]}</option>)}</select></div>
                <div><label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" name="tax_manual" defaultChecked={l.tax_manual} className="accent-purple" /> กำหนดภาษีเอง</label><input name="tax_wht" type="number" step="0.01" defaultValue={l.tax_wht} className="input" /></div>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="label">ธนาคาร</label><input name="bank_name" defaultValue={l.bank_name ?? ""} className="input" /></div>
              <div><label className="label">เลขบัญชี</label><input name="bank_account" defaultValue={l.bank_account ?? ""} className="input" /></div>
              <div><label className="label">ชื่อบัญชี</label><input name="account_name" defaultValue={l.account_name ?? ""} className="input" /></div>
            </div>
            <div><label className="label">หมายเหตุบนสลิป</label><input name="note" defaultValue={l.note ?? ""} className="input" /></div>
          </fieldset>
          <div className="flex gap-2">{!ro && <button className="btn-primary">บันทึกและคำนวณ</button>}<Link href={`/hr/payroll/${runId}`} className="btn-ghost">กลับ</Link></div>
        </form>
        <div className="card p-5 space-y-1.5 text-sm lg:sticky lg:top-4">
          <h3 className="font-display font-bold mb-1">ผลคำนวณล่าสุด</h3>
          <Row k="เงินเดือน + ค่าตำแหน่ง" v={l.salary + l.position_allowance} /><Row k="OT" v={l.ot_amount} /><Row k="คอมมิชชั่น" v={l.commission_amount} /><Row k="เบี้ยขยัน/โบนัส/อื่น" v={l.diligence + l.bonus + l.other_income} />
          <Row k="รายได้รวม" v={l.earnings} bold />
          <Row k="หักสาย" v={l.late_deduct} neg /><Row k="หักขาด/ลาไม่รับเงิน" v={l.absence_deduct} neg />
          <Row k={`ประกันสังคม${l.sso_on ? ` (ฐาน ${money(l.sso_base)})` : " (ไม่หัก)"}`} v={l.sso_employee} neg /><Row k="ภาษี ณ ที่จ่าย" v={l.tax_wht} neg /><Row k="เบิกล่วงหน้า/หักอื่น" v={l.advance + l.other_deduct} neg />
          <div className="border-t border-line pt-2"><Row k="รับสุทธิ" v={l.net_pay} bold /></div>
          {l.sso_on && <div className="text-[11px] text-ink-soft">นายจ้างสมทบประกันสังคม {money(l.sso_employer)}</div>}
          <a href={`/print/payslips/${runId}?line=${lineId}`} target="_blank" rel="noreferrer" className="btn-outline w-full text-xs mt-2">ดูสลิป</a>
        </div>
      </div>
    </div>
  );
}
