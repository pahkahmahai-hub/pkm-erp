import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui";
import { requirePayroll } from "@/lib/payroll/server";
import { TAX_METHOD_TH, type PayrollProfile, type TaxMethod } from "@/lib/payroll/calc";
import { savePayrollProfile } from "../../actions";

export const dynamic = "force-dynamic";

export default async function PayrollProfileEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const { sb } = await requirePayroll(`/hr/payroll/profiles/${id}`);
  const [{ data: e }, { data: p0 }] = await Promise.all([
    sb.from("employees").select("id, emp_code, first_name, last_name, nickname, position").eq("id", id).maybeSingle(),
    sb.from("payroll_profiles").select("*").eq("employee_id", id).maybeSingle(),
  ]);
  if (!e) notFound();
  const p = p0 as PayrollProfile | null;
  return (
    <div className="space-y-4 max-w-3xl">
      <Header crumbs={[{ href: "/hr", label: "HR" }, { href: "/hr/payroll", label: "PAYROLL" }, { href: "/hr/payroll/profiles", label: "ข้อมูลเงินเดือน" }]} title={`${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`} sub={`${e.emp_code} · ${e.position ?? ""}`} />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <form action={savePayrollProfile.bind(null, id)} className="card p-5 space-y-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="label">เงินเดือน (บาท/เดือน)</label><input name="base_salary" type="number" step="0.01" defaultValue={p?.base_salary ?? 0} className="input" /><p className="text-[11px] text-ink-soft mt-0.5">รับเป็นคอมมิชชั่นอย่างเดียว = 0</p></div>
          <div><label className="label">ค่าตำแหน่ง (บาท/เดือน)</label><input name="position_allowance" type="number" step="0.01" defaultValue={p?.position_allowance ?? 0} className="input" /></div>
          <div><label className="label">คอมมิชชั่น (% ของยอดขาย)</label><input name="commission_rate" type="number" step="0.001" defaultValue={p?.commission_rate ?? 0} className="input" /><p className="text-[11px] text-ink-soft mt-0.5">ใส่ยอดขายในงวด ระบบคูณให้ · หรือกรอกยอดคอมฯ เองก็ได้</p></div>
          <div><label className="label">ค่าแรง/ชม. สำหรับ OT</label><input name="ot_hourly_rate" type="number" step="0.01" defaultValue={p?.ot_hourly_rate ?? ""} className="input" placeholder="ว่าง = เงินเดือน ÷ 30 ÷ 8" /></div>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="sso_enabled" defaultChecked={p?.sso_enabled ?? true} className="accent-purple" /> หักประกันสังคม (เมื่อถึงงวดที่เริ่มหัก)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="deduct_late" defaultChecked={p?.deduct_late ?? true} className="accent-purple" /> หักเงินเมื่อมาสาย</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="include_in_payroll" defaultChecked={p?.include_in_payroll ?? true} className="accent-purple" /> รวมในการทำ payroll</label>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="label">วิธีหักภาษี</label><select name="tax_method" defaultValue={p?.tax_method ?? "pnd1"} className="input">{(Object.keys(TAX_METHOD_TH) as TaxMethod[]).map((k) => <option key={k} value={k}>{TAX_METHOD_TH[k]}</option>)}</select></div>
          <div><label className="label">ยอดภาษีต่อเดือน (ถ้าเลือก "กำหนดเอง")</label><input name="tax_fixed" type="number" step="0.01" defaultValue={p?.tax_fixed ?? 0} className="input" /></div>
          <div><label className="label">ลดหย่อนอื่นต่อปี</label><input name="tax_extra_deduction" type="number" step="0.01" defaultValue={p?.tax_extra_deduction ?? 0} className="input" /><p className="text-[11px] text-ink-soft mt-0.5">คู่สมรส บุตร ประกันชีวิต กองทุน ฯลฯ รวมกัน</p></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="label">ธนาคาร</label><input name="bank_name" defaultValue={p?.bank_name ?? ""} className="input" placeholder="เช่น กสิกรไทย" /></div>
          <div><label className="label">เลขบัญชี</label><input name="bank_account" defaultValue={p?.bank_account ?? ""} className="input" inputMode="numeric" /></div>
          <div><label className="label">ชื่อบัญชี</label><input name="account_name" defaultValue={p?.account_name ?? `${e.first_name} ${e.last_name}`} className="input" /></div>
        </div>
        <div><label className="label">หมายเหตุ</label><input name="note" defaultValue={p?.note ?? ""} className="input" /></div>
        <div className="flex gap-2"><button className="btn-primary">บันทึก</button><Link href="/hr/payroll/profiles" className="btn-ghost">ยกเลิก</Link></div>
      </form>
    </div>
  );
}
