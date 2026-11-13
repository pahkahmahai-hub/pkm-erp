import Link from "next/link";
import { Header } from "@/components/ui";
import { requirePayroll, loadPayrollSettings } from "@/lib/payroll/server";
import { money, hourlyOf, TAX_METHOD_TH, type PayrollProfile } from "@/lib/payroll/calc";

export const dynamic = "force-dynamic";

export default async function PayrollProfiles({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { sb } = await requirePayroll("/hr/payroll/profiles");
  const s = await loadPayrollSettings(sb);
  const [{ data: emps }, { data: profs }] = await Promise.all([
    sb.from("employees").select("id, emp_code, first_name, last_name, nickname, position, status").neq("status", "resigned").order("emp_code"),
    sb.from("payroll_profiles").select("*"),
  ]);
  const P = new Map(((profs ?? []) as PayrollProfile[]).map((p) => [p.employee_id, p]));
  return (
    <div className="space-y-4">
      <Header crumbs={[{ href: "/hr", label: "HR" }, { href: "/hr/payroll", label: "PAYROLL" }]} title="ข้อมูลเงินเดือนพนักงาน" sub="กดชื่อเพื่อตั้งเงินเดือน ค่าตำแหน่ง % คอมมิชชั่น ประกันสังคม ภาษี และบัญชีธนาคาร" />
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      <div className="card overflow-x-auto">
        <table className="tbl text-sm">
          <thead><tr><th>พนักงาน</th><th className="text-right">เงินเดือน</th><th className="text-right">ค่าตำแหน่ง</th><th className="text-right">คอมฯ %</th><th className="text-right">ค่าแรง/ชม. (OT)</th><th>ประกันสังคม</th><th>ภาษี</th><th>บัญชีธนาคาร</th></tr></thead>
          <tbody>
            {(emps ?? []).map((e) => { const p = P.get(e.id as string); return (
              <tr key={e.id as string} className={p?.include_in_payroll === false ? "opacity-50" : ""}>
                <td><Link href={`/hr/payroll/profiles/${e.id}`} className="text-purple font-semibold hover:underline">{e.nickname ?? e.first_name} {e.last_name}</Link><div className="text-[11px] text-ink-soft">{e.emp_code as string} · {(e.position as string) ?? ""}{!p && <span className="text-red"> · ยังไม่ตั้งค่า</span>}{p?.include_in_payroll === false && " · ไม่รวมใน payroll"}</div></td>
                <td className="text-right">{p ? money(p.base_salary) : "—"}</td>
                <td className="text-right">{p ? money(p.position_allowance) : "—"}</td>
                <td className="text-right">{p?.commission_rate ? `${p.commission_rate}%` : "—"}</td>
                <td className="text-right">{p ? money(hourlyOf(p, s)) : "—"}</td>
                <td>{p ? (p.sso_enabled ? "หัก" : "ไม่หัก") : "—"}</td>
                <td className="text-xs">{p ? TAX_METHOD_TH[p.tax_method] : "—"}</td>
                <td className="text-xs">{p?.bank_account ? `${p.bank_name ?? ""} ${p.bank_account}` : "—"}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
