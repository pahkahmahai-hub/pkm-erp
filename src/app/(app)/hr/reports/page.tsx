import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { currentYm } from "@/lib/format";
import { buildMonthlyReport } from "@/lib/report";
import { ExportButton } from "./ExportButton";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  await requireAdmin();
  const { ym = currentYm() } = await searchParams;
  const supabase = await createClient();
  const { rows, leaveTypes } = await buildMonthlyReport(supabase, ym);
  const [y, m] = ym.split("-");
  const label = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date(Number(y), Number(m) - 1, 1));

  return (
    <div className="space-y-6">
      <Header title="รายงานประจำเดือน" sub={`${label} · วันทำงาน ${rows[0]?.workdays ?? 0} วัน`} action={<ExportButton rows={rows} leaveTypes={leaveTypes} ym={ym} />} />
      <form className="flex gap-3 items-end">
        <MonthPicker value={ym} />
        <button className="btn-outline">แสดง</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[900px]">
          <thead>
            <tr>
              <th>รหัส</th><th>พนักงาน</th><th>ทีม</th>
              <th className="text-right">มา</th><th className="text-right">สาย (ครั้ง)</th><th className="text-right">สายรวม (นาที)</th>
              <th className="text-right">นอกพื้นที่</th>
              {leaveTypes.map((t) => <th key={t.code} className="text-right">{t.name_th}</th>)}
              <th className="text-right">ขาด</th><th className="text-right">OT (ชม.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id}>
                <td className="font-mono text-xs">{r.emp_code}</td>
                <td>{r.name}</td>
                <td><span className="badge-off">{r.team}</span></td>
                <td className="text-right">{r.present}</td>
                <td className={`text-right ${r.late ? "text-red font-semibold" : ""}`}>{r.late}</td>
                <td className="text-right">{r.late_minutes}</td>
                <td className={`text-right ${r.outside ? "text-red" : ""}`}>{r.outside}</td>
                {leaveTypes.map((t) => <td key={t.code} className="text-right">{r.leave[t.code] ?? 0}</td>)}
                <td className={`text-right ${r.absent ? "text-red font-semibold" : ""}`}>{r.absent}</td>
                <td className="text-right">{r.ot_hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">* "ขาด" นับเฉพาะวันทำงานที่ผ่านมาแล้วซึ่งไม่มีเช็คอินและไม่มีใบลาอนุมัติ · วันหยุดบริษัทตั้งได้ที่หน้าตั้งค่า</p>
    </div>
  );
}
