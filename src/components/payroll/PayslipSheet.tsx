import { money, periodLabel, type PayrollLine } from "@/lib/payroll/calc";

export interface SlipEmp { emp_code: string; title: string | null; first_name: string; last_name: string; position: string | null; team?: string | null }
export interface SlipCompany { name_th: string; address_th: string | null; tax_id: string | null }

const fmtD = (d: string | null) => (d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}/${Number(d.slice(0, 4)) + 543}` : "—");

/** สลิปเงินเดือน 1 ใบ (ครึ่ง A4) — inline style เพื่อพิมพ์/บันทึก PDF ได้ตรง */
export function PayslipSheet({ l, emp, co, period, payDate, ytd }: { l: PayrollLine; emp: SlipEmp; co: SlipCompany | null; period: string; payDate: string | null; ytd?: { earnings: number; tax: number; sso: number } }) {
  const earn: [string, number][] = [
    ["เงินเดือน", l.salary], ["ค่าตำแหน่ง", l.position_allowance],
    [`ค่าล่วงเวลา (OT)${l.ot_hours_weekday + l.ot_hours_holiday1 + l.ot_hours_holiday3 ? ` ${l.ot_hours_weekday + l.ot_hours_holiday1 + l.ot_hours_holiday3} ชม.` : ""}`, l.ot_amount],
    ["คอมมิชชั่น", l.commission_amount], ["เบี้ยขยัน", l.diligence], ["โบนัส", l.bonus], [`รายได้อื่น${l.other_income_note ? ` (${l.other_income_note})` : ""}`, l.other_income],
  ];
  const ded: [string, number][] = [
    [`หักมาสาย${l.late_minutes ? ` ${l.late_minutes} นาที` : ""}`, l.late_deduct], [`หักขาดงาน/ลาไม่รับค่าจ้าง${l.absent_days + l.unpaid_leave_days ? ` ${l.absent_days + l.unpaid_leave_days} วัน` : ""}`, l.absence_deduct],
    ["ประกันสังคม", l.sso_employee], ["ภาษีหัก ณ ที่จ่าย", l.tax_wht], ["เบิกล่วงหน้า", l.advance], [`หักอื่นๆ${l.other_deduct_note ? ` (${l.other_deduct_note})` : ""}`, l.other_deduct],
  ];
  const E = earn.filter(([, v]) => Number(v) !== 0); const D = ded.filter(([, v]) => Number(v) !== 0);
  const rows = Math.max(E.length, D.length, 4);
  const td: React.CSSProperties = { padding: "4px 8px", fontSize: 12.5, verticalAlign: "top" };
  const name = `${emp.title ?? ""}${emp.first_name} ${emp.last_name}`;
  return (
    <div className="slip" style={{ fontFamily: "'IBM Plex Sans Thai', sans-serif", color: "#1d1530", border: "1px solid #c9bfe0", borderRadius: 10, padding: "14px 18px", margin: "0 auto 14px", maxWidth: 760, background: "#fff", breakInside: "avoid" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #452a79", paddingBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{co?.name_th ?? "บริษัท ปากาม้า (ไทยแลนด์) จำกัด"}</div>
          {co?.address_th && <div style={{ fontSize: 11, color: "#6b6380" }}>{co.address_th}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#452a79" }}>สลิปเงินเดือน / PAYSLIP</div>
          <div style={{ fontSize: 12 }}>งวด {periodLabel(period)} · จ่ายวันที่ {fmtD(payDate)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, fontSize: 12.5, padding: "8px 0" }}>
        <div>ชื่อ: <b>{name}</b></div><div>รหัส: <b>{emp.emp_code}</b></div>{emp.position && <div>ตำแหน่ง: {emp.position}</div>}
        {l.bank_account && <div>โอนเข้า: {l.bank_name ?? ""} {l.bank_account}</div>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e4dcf3" }}>
        <thead><tr style={{ background: "#f3effa" }}>
          <th style={{ ...td, textAlign: "left" }}>รายได้</th><th style={{ ...td, textAlign: "right", width: 110 }}>จำนวนเงิน</th>
          <th style={{ ...td, textAlign: "left", borderLeft: "1px solid #e4dcf3" }}>รายการหัก</th><th style={{ ...td, textAlign: "right", width: 110 }}>จำนวนเงิน</th>
        </tr></thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td style={td}>{E[i]?.[0] ?? ""}</td><td style={{ ...td, textAlign: "right" }}>{E[i] ? money(E[i][1]) : ""}</td>
              <td style={{ ...td, borderLeft: "1px solid #e4dcf3" }}>{D[i]?.[0] ?? ""}</td><td style={{ ...td, textAlign: "right" }}>{D[i] ? money(D[i][1]) : ""}</td>
            </tr>
          ))}
          <tr style={{ background: "#faf8fd", fontWeight: 700 }}>
            <td style={td}>รวมรายได้</td><td style={{ ...td, textAlign: "right" }}>{money(l.earnings)}</td>
            <td style={{ ...td, borderLeft: "1px solid #e4dcf3" }}>รวมรายการหัก</td><td style={{ ...td, textAlign: "right" }}>{money(l.total_deduct)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "#6b6380" }}>
          {ytd && <>สะสมทั้งปี: รายได้ {money(ytd.earnings)} · ภาษี {money(ytd.tax)} · ประกันสังคม {money(ytd.sso)}</>}
          {l.note && <div>หมายเหตุ: {l.note}</div>}
        </div>
        <div style={{ background: "#452a79", color: "#fff", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 15 }}>รับสุทธิ {money(l.net_pay)} บาท</div>
      </div>
      <div style={{ fontSize: 10, color: "#9a93ad", marginTop: 6 }}>เอกสารนี้ออกจากระบบ PKM ERP · ข้อมูลเงินเดือนเป็นความลับ</div>
    </div>
  );
}
