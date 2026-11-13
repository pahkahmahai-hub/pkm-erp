import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { payrollClient } from "@/lib/payroll/server";
import { PrintButton } from "@/components/sales/PrintButton";
import { PayslipSheet, type SlipEmp, type SlipCompany } from "@/components/payroll/PayslipSheet";
import type { PayrollLine, PayrollRun } from "@/lib/payroll/calc";

export const dynamic = "force-dynamic";

/** สลิปทั้งงวด (หรือ ?line= เฉพาะคน) — ผู้บริหารที่ปลดล็อก PAYROLL แล้วเท่านั้น */
export default async function PrintPayslips({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ line?: string }> }) {
  const { runId } = await params; const sp = await searchParams;
  const session = await getSession();
  if (!session.isAdmin) redirect("/hr");
  const sb = await payrollClient();
  const { data: ok } = await sb.rpc("payroll_unlocked");
  if (!ok) redirect(`/hr/payroll/unlock?next=/hr/payroll/${runId}`);
  let q = sb.from("payroll_lines").select("*").eq("run_id", runId);
  if (sp.line) q = q.eq("id", sp.line);
  const [{ data: run }, { data: lines }, { data: emps }, { data: co }] = await Promise.all([
    sb.from("payroll_runs").select("*").eq("id", runId).maybeSingle(), q,
    sb.from("employees").select("id, emp_code, title, first_name, last_name, position"),
    sb.from("companies").select("name_th, address_th, tax_id").eq("code", "PKM").maybeSingle(),
  ]);
  if (!run) notFound();
  const r = run as PayrollRun;
  const E = new Map((emps ?? []).map((e) => [e.id as string, e as unknown as SlipEmp]));
  const L = ((lines ?? []) as PayrollLine[]).sort((a, b) => String(E.get(a.employee_id)?.emp_code).localeCompare(String(E.get(b.employee_id)?.emp_code)));
  return (
    <div style={{ background: "#f3f0f8", minHeight: "100vh", padding: 20 }}>
      <style>{`@media print { .noprint { display:none !important } body { background:#fff } .slip { border-color:#999 !important } } @page { size: A4; margin: 10mm }`}</style>
      <PrintButton />
      {L.map((l) => <PayslipSheet key={l.id} l={l} emp={E.get(l.employee_id) ?? { emp_code: "", title: null, first_name: "", last_name: "", position: null }} co={co as SlipCompany | null} period={r.period} payDate={r.pay_date} />)}
    </div>
  );
}
