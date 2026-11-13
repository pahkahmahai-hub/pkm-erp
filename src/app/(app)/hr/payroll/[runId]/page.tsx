import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCw, Lock, Unlock, Printer, FileSpreadsheet, Landmark } from "lucide-react";
import { Header } from "@/components/ui";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { requirePayroll } from "@/lib/payroll/server";
import { money, periodLabel, type PayrollLine, type PayrollRun } from "@/lib/payroll/calc";
import { refreshPayrollAuto, setPayrollRunStatus, deletePayrollRun, updatePayDate, setRunDeductLate, createPayrollWht } from "../actions";

export const dynamic = "force-dynamic";

export default async function PayrollRunPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ error?: string; created?: string; refreshed?: string; saved?: string; wht?: string }> }) {
  const { runId } = await params; const sp = await searchParams;
  const { sb } = await requirePayroll(`/hr/payroll/${runId}`);
  const [{ data: run }, { data: lines }, { data: emps }, { data: whts }] = await Promise.all([
    sb.from("payroll_runs").select("*").eq("id", runId).maybeSingle(),
    sb.from("payroll_lines").select("*").eq("run_id", runId),
    sb.from("employees").select("id, emp_code, first_name, last_name, nickname"),
    sb.from("wht_certificates").select("id, cert_no, payroll_line_id, wht_amount, form"),
  ]);
  const whtByLine = new Map((whts ?? []).filter((w) => w.payroll_line_id).map((w) => [w.payroll_line_id as string, w]));
  if (!run) notFound();
  const r = run as PayrollRun; const draft = r.status === "draft";
  const E = new Map((emps ?? []).map((e) => [e.id as string, e]));
  const L = ((lines ?? []) as PayrollLine[]).sort((a, b) => String(E.get(a.employee_id)?.emp_code).localeCompare(String(E.get(b.employee_id)?.emp_code)));
  const sum = (k: keyof PayrollLine) => L.reduce((s, l) => s + Number(l[k] ?? 0), 0);
  const noBank = L.filter((l) => !l.bank_account && l.net_pay > 0).length;
  return (
    <div className="space-y-4">
      <Header crumbs={[{ href: "/hr", label: "HR" }, { href: "/hr/payroll", label: "PAYROLL" }]} title={`เงินเดือน ${periodLabel(r.period)}`}
        sub={draft ? "ร่าง — แก้ไขได้ · ปิดงวดแล้วพนักงานจะเห็นสลิปของตัวเอง" : `ปิดงวดแล้ว ${r.closed_at ? new Date(r.closed_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : ""} — พนักงานเห็นสลิปแล้ว`}
        action={<span className={draft ? "badge-pending" : "badge-approved"}>{draft ? "ร่าง" : "ปิดงวดแล้ว"}</span>} />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {sp.created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">สร้างงวดแล้ว — ดึง OT/สาย/ขาดงานจาก HR ให้แล้ว ตรวจและแก้รายคนได้ (กดชื่อ)</div>}
      {sp.wht && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ออกหนังสือรับรองหัก ณ ที่จ่ายใหม่ {sp.wht} ใบ — กดเลข WT ในตารางเพื่อพิมพ์</div>}
      {sp.refreshed && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ดึงข้อมูล OT/สาย/ขาดงานใหม่แล้ว</div>}

      <div className="flex flex-wrap gap-2 items-center">
        {draft && <form action={refreshPayrollAuto.bind(null, runId)}><button className="btn-outline text-sm"><RefreshCw size={14} /> ดึง OT / สาย / ขาด ใหม่</button></form>}
        {draft && ([["deduct_late", "หักสาย"], ["deduct_absence", "หักขาดงาน"]] as const).map(([f, label]) => { const allOn = L.length > 0 && L.every((l) => l[f] !== false); const some = L.some((l) => l[f] !== false); return (
          <form key={f} action={setRunDeductLate.bind(null, runId, !allOn, f)} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm">
            <span>{label}</span>
            <button className={`relative h-6 w-11 rounded-full transition ${allOn ? "bg-purple" : "bg-line"}`} aria-label={`เปิด/ปิด ${label} ทั้งงวด`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${allOn ? "left-[22px]" : "left-0.5"}`} /></button>
            <span className="text-xs text-ink-soft">{allOn ? "เปิด" : some ? "บางคน" : "ปิด"}</span>
          </form>); })}
        <a href={`/print/payslips/${runId}`} target="_blank" rel="noreferrer" className="btn-outline text-sm"><Printer size={14} /> พิมพ์สลิปทั้งหมด</a>
        <a href={`/hr/payroll/${runId}/export?type=summary`} className="btn-outline text-sm"><FileSpreadsheet size={14} /> Excel สำหรับสำนักงานบัญชี</a>
        {L.some((l) => l.tax_wht > 0) && <form action={createPayrollWht.bind(null, runId)}><button className="btn-outline text-sm" title="ออกหนังสือรับรองหัก ณ ที่จ่าย ให้ทุกคนที่ถูกหักภาษีงวดนี้ (คนที่มีใบแล้วจะข้าม)">🧾 ออก 50 ทวิ งวดนี้</button></form>}
        <a href={`/hr/payroll/${runId}/export?type=bank`} className="btn-outline text-sm"><Landmark size={14} /> ไฟล์โอนเงิน</a>
        <span className="flex-1" />
        {draft
          ? <form action={setPayrollRunStatus.bind(null, runId, "closed")}><button className="btn-primary text-sm"><Lock size={14} /> ปิดงวด (ส่งสลิปให้พนักงาน)</button></form>
          : <form action={setPayrollRunStatus.bind(null, runId, "draft")}><button className="btn-outline text-sm"><Unlock size={14} /> เปิดแก้ไขอีกครั้ง</button></form>}
        {draft && <ConfirmDelete action={deletePayrollRun.bind(null, runId)} label="ลบงวด" warning="ลบงวดนี้ทั้งหมด (ยังไม่ปิด) — สร้างใหม่ได้" />}
      </div>
      {noBank > 0 && <div className="rounded-xl bg-yellow/15 text-[#6b4f00] text-xs px-4 py-2">มี {noBank} คนยังไม่มีเลขบัญชี — ไฟล์โอนเงินจะเว้นว่างไว้ (ตั้งที่ ข้อมูลเงินเดือนพนักงาน)</div>}

      <div className="card overflow-x-auto">
        <table className="tbl text-sm">
          <thead><tr>
            <th>พนักงาน</th><th className="text-right">เงินเดือน+ตำแหน่ง</th><th className="text-right">OT</th><th className="text-right">คอมมิชชั่น</th><th className="text-right">อื่นๆ (ขยัน/โบนัส/อื่น)</th>
            <th className="text-right">รายได้รวม</th><th className="text-right">หักสาย</th><th className="text-right">หักขาด</th><th className="text-right">ประกันสังคม</th><th className="text-right">ภาษี</th><th className="text-right">เบิก/หักอื่น</th><th className="text-right">รับสุทธิ</th>
          </tr></thead>
          <tbody>
            {L.map((l) => { const e = E.get(l.employee_id); return (
              <tr key={l.id} className={sp.saved === l.id ? "bg-green/5" : ""}>
                <td><Link href={`/hr/payroll/${runId}/${l.id}`} className="text-purple font-semibold hover:underline">{e?.nickname ?? e?.first_name} {e?.last_name}</Link><div className="text-[11px] text-ink-soft">{e?.emp_code as string}{l.late_minutes ? ` · สาย ${l.late_minutes} น.${l.deduct_late === false ? " (ไม่หัก)" : ""}` : ""}{l.absent_days ? ` · ขาด ${l.absent_days} วัน${l.deduct_absence === false ? " (ไม่หัก)" : ""}` : ""}{l.ot_hours_weekday + l.ot_hours_holiday1 + l.ot_hours_holiday3 ? ` · OT ${l.ot_hours_weekday + l.ot_hours_holiday1 + l.ot_hours_holiday3} ชม.` : ""}</div></td>
                <td className="text-right">{money(l.salary + l.position_allowance)}</td><td className="text-right">{money(l.ot_amount)}</td><td className="text-right">{money(l.commission_amount)}</td>
                <td className="text-right">{money(l.diligence + l.bonus + l.other_income)}</td><td className="text-right font-semibold">{money(l.earnings)}</td>
                <td className="text-right text-red">{money(l.late_deduct)}</td><td className="text-right text-red">{money(l.absence_deduct)}</td><td className="text-right">{l.sso_on ? money(l.sso_employee) : <span className="text-ink-soft text-xs">ไม่หัก</span>}</td>
                <td className="text-right">{money(l.tax_wht)}{whtByLine.get(l.id) && <a href={`/print/wht/${whtByLine.get(l.id)!.id}`} target="_blank" rel="noreferrer" className="block text-[10px] text-purple underline">{whtByLine.get(l.id)!.cert_no as string}</a>}</td><td className="text-right">{money(l.advance + l.other_deduct)}</td><td className="text-right font-bold">{money(l.net_pay)}</td>
              </tr>); })}
            {!L.length && <tr><td colSpan={12} className="text-center text-ink-soft py-6">ไม่มีพนักงานในงวดนี้</td></tr>}
          </tbody>
          {L.length > 0 && <tfoot><tr className="font-bold">
            <td>รวม {L.length} คน</td><td className="text-right">{money(sum("salary") + sum("position_allowance"))}</td><td className="text-right">{money(sum("ot_amount"))}</td><td className="text-right">{money(sum("commission_amount"))}</td>
            <td className="text-right">{money(sum("diligence") + sum("bonus") + sum("other_income"))}</td><td className="text-right">{money(sum("earnings"))}</td><td className="text-right">{money(sum("late_deduct"))}</td><td className="text-right">{money(sum("absence_deduct"))}</td>
            <td className="text-right">{money(sum("sso_employee"))}</td><td className="text-right">{money(sum("tax_wht"))}</td><td className="text-right">{money(sum("advance") + sum("other_deduct"))}</td><td className="text-right">{money(sum("net_pay"))}</td>
          </tr></tfoot>}
        </table>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="card p-4"><div className="text-xs text-ink-soft">ประกันสังคมนำส่ง (ลูกจ้าง + นายจ้าง)</div><div className="font-display font-bold text-lg">{money(sum("sso_employee") + sum("sso_employer"))}</div><div className="text-[11px] text-ink-soft">นายจ้างสมทบ {money(sum("sso_employer"))}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft">ภาษีหัก ณ ที่จ่ายนำส่ง</div><div className="font-display font-bold text-lg">{money(sum("tax_wht"))}</div></div>
        <form action={updatePayDate.bind(null, runId)} className="card p-4 space-y-2"><div className="text-xs text-ink-soft">วันที่จ่าย / หมายเหตุงวด</div><div className="flex gap-2"><input type="date" name="pay_date" defaultValue={r.pay_date ?? ""} className="input py-1" /><button className="btn-outline py-1 px-3 text-xs">บันทึก</button></div><input name="note" defaultValue={r.note ?? ""} className="input py-1 text-sm" placeholder="หมายเหตุ" /></form>
      </div>
    </div>
  );
}
