import Link from "next/link";
import { Lock, Settings, Users, Plus, ChevronRight } from "lucide-react";
import { Header } from "@/components/ui";
import { requirePayroll, loadPayrollSettings } from "@/lib/payroll/server";
import { money, periodLabel, ssoActive, type PayrollRun } from "@/lib/payroll/calc";
import { createPayrollRun, lockPayroll, createPayrollWhtAnnual } from "./actions";

export const dynamic = "force-dynamic";

export default async function PayrollHome({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; whtyear?: string; whtn?: string }> }) {
  const sp = await searchParams;
  const { sb } = await requirePayroll("/hr/payroll");
  const s = await loadPayrollSettings(sb);
  const [{ data: runs }, { data: lines }, { count: profCount }, { count: empCount }, { data: annual }] = await Promise.all([
    sb.from("payroll_runs").select("*").order("period", { ascending: false }),
    sb.from("payroll_lines").select("run_id, earnings, net_pay, sso_employee, sso_employer, tax_wht"),
    sb.from("payroll_profiles").select("employee_id", { count: "exact", head: true }),
    sb.from("employees").select("id", { count: "exact", head: true }).neq("status", "resigned"),
    sb.from("wht_certificates").select("id, cert_no, payee_name, payroll_year, income_amount, wht_amount").not("payroll_year", "is", null).order("payroll_year", { ascending: false }),
  ]);
  const years = [...new Set(((runs ?? []) as PayrollRun[]).map((r) => Number(r.period.slice(0, 4))))].sort((a, b) => b - a);
  const tot = (runId: string) => (lines ?? []).filter((l) => l.run_id === runId).reduce((a, l) => ({ n: a.n + 1, net: a.net + Number(l.net_pay), earn: a.earn + Number(l.earnings), sso: a.sso + Number(l.sso_employee) + Number(l.sso_employer), tax: a.tax + Number(l.tax_wht) }), { n: 0, net: 0, earn: 0, sso: 0, tax: 0 });
  const now = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  return (
    <div className="space-y-5">
      <Header crumbs={[{ href: "/hr", label: "HR" }]} title="PAYROLL" sub={`เงินเดือน · OT · คอมมิชชั่น · ประกันสังคม (เริ่มหัก ${periodLabel(s.sso_start_month)}) · ภาษี ณ ที่จ่าย`}
        action={<form action={lockPayroll}><button className="btn-outline"><Lock size={15} /> ล็อก PAYROLL</button></form>} />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบงวดแล้ว</div>}

      <div className="grid sm:grid-cols-2 gap-3">
        <Link href="/hr/payroll/profiles" className="card p-4 flex items-center justify-between hover:border-purple"><span className="flex items-center gap-2 font-semibold"><Users size={18} className="text-purple" /> ข้อมูลเงินเดือนพนักงาน</span><span className="text-xs text-ink-soft">ตั้งค่าแล้ว {profCount ?? 0}/{empCount ?? 0} คน <ChevronRight size={14} className="inline" /></span></Link>
        <Link href="/hr/payroll/settings" className="card p-4 flex items-center justify-between hover:border-purple"><span className="flex items-center gap-2 font-semibold"><Settings size={18} className="text-purple" /> ตั้งค่า (ประกันสังคม · OT · ภาษี · รหัสผ่าน)</span><ChevronRight size={14} /></Link>
      </div>

      <form action={createPayrollRun} className="card p-5 flex flex-wrap items-end gap-3">
        <div><label className="label">สร้างงวดเงินเดือน — เดือน</label><input type="month" name="period" defaultValue={now} className="input" required /></div>
        <div><label className="label">วันที่จ่าย</label><input type="date" name="pay_date" className="input" /></div>
        <button className="btn-primary"><Plus size={16} /> สร้างงวด</button>
        <p className="text-[11px] text-ink-soft basis-full">ระบบดึงเงินเดือน/ค่าตำแหน่งจากข้อมูลพนักงาน · OT ที่อนุมัติแล้ว · นาทีสาย · วันขาดงาน จากระบบ HR ให้อัตโนมัติ แล้วแก้ไขรายคนได้ · {ssoActive(`${now}-01`, s) ? "เดือนนี้หักประกันสังคม" : `ยังไม่หักประกันสังคมจนถึง ${periodLabel(s.sso_start_month)}`}</p>
      </form>

      <div className="card p-5 space-y-3">
        <form action={createPayrollWhtAnnual} className="flex flex-wrap items-end gap-3">
          <div><label className="label">หนังสือรับรองหัก ณ ที่จ่าย สรุปทั้งปี (ภ.ง.ด.1ก) — ปี</label><select name="year" className="input">{(years.length ? years : [Number(now.slice(0, 4))]).map((y) => <option key={y} value={y}>{y + 543}</option>)}</select></div>
          <button className="btn-outline">🧾 ออก / อัปเดต 50 ทวิ ทั้งปี</button>
          <p className="text-[11px] text-ink-soft basis-full">1 ใบต่อคน รวมทุกงวดที่ปิดแล้วของปีนั้น (เงินได้ ภาษี ประกันสังคม) · กดซ้ำ = อัปเดตยอดในใบเดิม · ให้พนักงานภายในก.พ. ของปีถัดไป · ช่องเลขประจำตัวผู้เสียภาษีของพนักงานเว้นว่าง (ระบบไม่เก็บเลขบัตรประชาชน)</p>
        </form>
        {sp.whtyear && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-2">ออก/อัปเดต 50 ทวิ ปี {Number(sp.whtyear) + 543} แล้ว {sp.whtn} ใบ{sp.whtn === "0" ? " — ยังไม่มีงวดที่ปิดแล้วในปีนี้" : ""}</div>}
        {(annual ?? []).length > 0 && <div className="flex flex-wrap gap-2">{(annual ?? []).map((w) => <a key={w.id as string} href={`/print/wht/${w.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-xs hover:border-purple"><b>{w.payroll_year as number + 543}</b> · {w.payee_name as string} · ภาษี {money(Number(w.wht_amount))}</a>)}</div>}
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl text-sm">
          <thead><tr><th>งวด</th><th>วันที่จ่าย</th><th>สถานะ</th><th className="text-right">พนักงาน</th><th className="text-right">รายได้รวม</th><th className="text-right">ประกันสังคม (2 ฝ่าย)</th><th className="text-right">ภาษี</th><th className="text-right">จ่ายสุทธิ</th></tr></thead>
          <tbody>
            {((runs ?? []) as PayrollRun[]).map((r) => { const t = tot(r.id); return (
              <tr key={r.id}>
                <td><Link href={`/hr/payroll/${r.id}`} className="text-purple font-semibold hover:underline">{periodLabel(r.period)}</Link></td>
                <td className="text-xs">{r.pay_date ?? "—"}</td>
                <td>{r.status === "closed" ? <span className="badge-approved">ปิดงวดแล้ว</span> : <span className="badge-pending">ร่าง</span>}</td>
                <td className="text-right">{t.n}</td><td className="text-right">{money(t.earn)}</td><td className="text-right">{money(t.sso)}</td><td className="text-right">{money(t.tax)}</td><td className="text-right font-bold">{money(t.net)}</td>
              </tr>); })}
            {!runs?.length && <tr><td colSpan={8} className="text-center text-ink-soft py-6">ยังไม่มีงวดเงินเดือน — เริ่มจากตั้ง "ข้อมูลเงินเดือนพนักงาน" แล้วสร้างงวดแรก</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
