import { Header } from "@/components/ui";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { money, periodLabel } from "@/lib/payroll/calc";

export const dynamic = "force-dynamic";

export default async function MyPayslips() {
  const session = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("payroll_lines").select("id, net_pay, earnings, payroll_runs!inner(period, pay_date, status)").eq("employee_id", session.employee?.id ?? "").eq("payroll_runs.status", "closed");
  const rows = ((data ?? []) as unknown as { id: string; net_pay: number; earnings: number; payroll_runs: { period: string; pay_date: string | null } }[]).sort((a, b) => b.payroll_runs.period.localeCompare(a.payroll_runs.period));
  return (
    <div className="space-y-4 max-w-2xl">
      <Header crumbs={[{ href: "/hr", label: "HR" }]} title="สลิปเงินเดือนของฉัน" sub="เห็นเฉพาะของตัวเอง · ขึ้นหลังผู้บริหารปิดงวด" />
      <div className="card divide-y divide-line">
        {rows.map((r) => (
          <a key={r.id} href={`/print/my-payslip/${r.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 hover:bg-cream">
            <div><div className="font-semibold">{periodLabel(r.payroll_runs.period)}</div><div className="text-xs text-ink-soft">จ่ายวันที่ {r.payroll_runs.pay_date ?? "—"}</div></div>
            <div className="text-right"><div className="text-xs text-ink-soft">รับสุทธิ</div><div className="font-display font-bold">{money(r.net_pay)}</div></div>
          </a>
        ))}
        {!rows.length && <div className="p-6 text-center text-ink-soft text-sm">ยังไม่มีสลิปเงินเดือน</div>}
      </div>
    </div>
  );
}
