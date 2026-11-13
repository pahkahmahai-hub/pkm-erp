import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/sales/PrintButton";
import { PayslipSheet, type SlipEmp, type SlipCompany } from "@/components/payroll/PayslipSheet";
import type { PayrollLine } from "@/lib/payroll/calc";

export const dynamic = "force-dynamic";

/** สลิปของพนักงานเอง (เห็นได้หลังปิดงวด — RLS ตรวจให้) */
export default async function MyPayslip({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const session = await getSession();
  const supabase = await createClient();
  const { data: line } = await supabase.from("payroll_lines").select("*, payroll_runs(period, pay_date)").eq("id", lineId).eq("employee_id", session.employee?.id ?? "").maybeSingle();
  if (!line) notFound();
  const l = line as PayrollLine & { payroll_runs: { period: string; pay_date: string | null } };
  const year = l.payroll_runs.period.slice(0, 4);
  const [{ data: emp }, { data: co }, { data: ytdRows }] = await Promise.all([
    supabase.from("employees").select("emp_code, title, first_name, last_name, position").eq("id", l.employee_id).maybeSingle(),
    supabase.from("companies").select("name_th, address_th, tax_id").eq("code", "PKM").maybeSingle(),
    supabase.from("payroll_lines").select("earnings, tax_wht, sso_employee, payroll_runs!inner(period)").eq("employee_id", l.employee_id).gte("payroll_runs.period", `${year}-01-01`).lte("payroll_runs.period", l.payroll_runs.period),
  ]);
  const ytd = (ytdRows ?? []).reduce((a, x) => ({ earnings: a.earnings + Number(x.earnings), tax: a.tax + Number(x.tax_wht), sso: a.sso + Number(x.sso_employee) }), { earnings: 0, tax: 0, sso: 0 });
  return (
    <div style={{ background: "#f3f0f8", minHeight: "100vh", padding: 20 }}>
      <style>{`@media print { .noprint { display:none !important } body { background:#fff } } @page { size: A4; margin: 10mm }`}</style>
      <PrintButton />
      <PayslipSheet l={l} emp={(emp ?? { emp_code: "", title: null, first_name: "", last_name: "", position: null }) as SlipEmp} co={co as SlipCompany | null} period={l.payroll_runs.period} payDate={l.payroll_runs.pay_date} ytd={ytd} />
    </div>
  );
}
