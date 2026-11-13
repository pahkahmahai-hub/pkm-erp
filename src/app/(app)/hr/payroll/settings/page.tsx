import { Header } from "@/components/ui";
import { requirePayroll, loadPayrollSettings } from "@/lib/payroll/server";
import { savePayrollSettings, setPayrollPassword } from "../actions";

export const dynamic = "force-dynamic";

export default async function PayrollSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { sb } = await requirePayroll("/hr/payroll/settings");
  const s = await loadPayrollSettings(sb);
  const F = ({ name, label, value, step = "0.01", hint }: { name: string; label: string; value: number; step?: string; hint?: string }) => (
    <div><label className="label">{label}</label><input name={name} type="number" step={step} defaultValue={value} className="input" />{hint && <p className="text-[11px] text-ink-soft mt-0.5">{hint}</p>}</div>
  );
  return (
    <div className="space-y-5 max-w-3xl">
      <Header crumbs={[{ href: "/hr", label: "HR" }, { href: "/hr/payroll", label: "PAYROLL" }]} title="ตั้งค่า PAYROLL" />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว — มีผลกับงวดที่สร้าง/คำนวณใหม่หลังจากนี้</div>}
      <form action={savePayrollSettings} className="card p-5 space-y-5">
        <div>
          <h3 className="font-display font-bold mb-2">ประกันสังคม (มาตรา 33)</h3>
          <div className="grid sm:grid-cols-4 gap-3">
            <div><label className="label">เริ่มหักตั้งแต่งวด</label><input type="month" name="sso_start_month" defaultValue={s.sso_start_month.slice(0, 7)} className="input" /></div>
            <F name="sso_rate" label="อัตรา (%)" value={s.sso_rate} />
            <F name="sso_min_base" label="ฐานค่าจ้างต่ำสุด" value={s.sso_min_base} />
            <F name="sso_max_base" label="ฐานค่าจ้างสูงสุด" value={s.sso_max_base} hint="ปี 2569–2571 = 17,500 (หักสูงสุด 875) — ตรวจกับสำนักงานบัญชี" />
          </div>
          <div className="mt-3 max-w-xs"><label className="label">เลขที่บัญชีนายจ้าง (สปส.)</label><input name="company_sso_no" defaultValue={s.company_sso_no ?? ""} className="input" /></div>
          <p className="text-[11px] text-ink-soft mt-1">ค่าจ้างที่ใช้คิด = เงินเดือน + ค่าตำแหน่ง + OT + คอมมิชชั่น − หักสาย/ขาด (ไม่รวมโบนัส เบี้ยขยัน รายได้อื่น) · นายจ้างสมทบเท่ากับลูกจ้าง</p>
        </div>
        <div>
          <h3 className="font-display font-bold mb-2">ค่าแรงและ OT</h3>
          <div className="grid sm:grid-cols-5 gap-3">
            <F name="days_per_month" label="วัน/เดือน" value={s.days_per_month} />
            <F name="hours_per_day" label="ชั่วโมง/วัน" value={s.hours_per_day} />
            <F name="ot_weekday_mult" label="OT วันทำงาน (เท่า)" value={s.ot_weekday_mult} />
            <F name="holiday_work_mult" label="ทำงานวันหยุด (เท่า)" value={s.holiday_work_mult} />
            <F name="ot_holiday_mult" label="OT วันหยุด (เท่า)" value={s.ot_holiday_mult} />
          </div>
          <p className="text-[11px] text-ink-soft mt-1">ค่าแรง/ชม. = เงินเดือน ÷ วัน/เดือน ÷ ชม./วัน · OT วันเสาร์–อาทิตย์/วันหยุดบริษัท: 8 ชม.แรก = ทำงานวันหยุด, ชม.ที่เกิน = OT วันหยุด · หักสาย = นาทีสาย × ค่าแรง/นาที · หักขาด = วัน × เงินเดือน ÷ 30</p>
        </div>
        <div>
          <h3 className="font-display font-bold mb-2">ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <F name="personal_allowance" label="ลดหย่อนส่วนตัว/ปี" value={s.personal_allowance} />
            <F name="expense_rate" label="ค่าใช้จ่าย (%)" value={s.expense_rate} />
            <F name="expense_cap" label="ค่าใช้จ่ายสูงสุด/ปี" value={s.expense_cap} />
          </div>
          <p className="text-[11px] text-ink-soft mt-1">ประมาณการทั้งปีจากรายได้เดือนนี้ × 12 − ค่าใช้จ่าย − ลดหย่อน (ส่วนตัว + ประกันสังคม + ลดหย่อนอื่นของแต่ละคน) → ภาษีขั้นบันได ÷ 12 · โบนัสคิดภาษีส่วนเพิ่มในเดือนที่จ่าย · แก้ยอดเองรายคนได้</p>
        </div>
        <button className="btn-primary">บันทึกการตั้งค่า</button>
      </form>

      <form action={setPayrollPassword} className="card p-5 space-y-3 max-w-md">
        <h3 className="font-display font-bold">เปลี่ยนรหัสผ่าน PAYROLL</h3>
        <input type="hidden" name="back" value="/hr/payroll/settings" />
        <div><label className="label">รหัสผ่านเดิม</label><input type="password" name="old_password" className="input" required autoComplete="current-password" /></div>
        <div><label className="label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label><input type="password" name="new_password" minLength={6} className="input" required autoComplete="new-password" /></div>
        <div><label className="label">ยืนยันรหัสผ่านใหม่</label><input type="password" name="confirm" minLength={6} className="input" required autoComplete="new-password" /></div>
        <button className="btn-outline">เปลี่ยนรหัสผ่าน</button>
        <p className="text-[11px] text-ink-soft">เปลี่ยนแล้วทั้งคุณและภรรยาต้องใส่รหัสใหม่</p>
      </form>
    </div>
  );
}
