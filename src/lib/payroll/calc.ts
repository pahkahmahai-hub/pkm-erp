// PAYROLL — สูตรคำนวณ (ใช้ทั้งฝั่ง server และแสดงผล)

export interface PayrollSettings {
  sso_rate: number; sso_min_base: number; sso_max_base: number; sso_start_month: string;
  days_per_month: number; hours_per_day: number; ot_weekday_mult: number; holiday_work_mult: number; ot_holiday_mult: number;
  personal_allowance: number; expense_rate: number; expense_cap: number; company_sso_no: string | null;
}
export type TaxMethod = "pnd1" | "flat3" | "fixed" | "none";
export interface PayrollProfile {
  employee_id: string; base_salary: number; position_allowance: number; commission_rate: number; ot_hourly_rate: number | null;
  deduct_late: boolean; sso_enabled: boolean; tax_method: TaxMethod; tax_fixed: number; tax_extra_deduction: number;
  bank_name: string | null; bank_account: string | null; account_name: string | null; include_in_payroll: boolean; note: string | null;
}
export interface PayrollLine {
  id: string; run_id: string; employee_id: string;
  salary: number; position_allowance: number; ot_hours_weekday: number; ot_hours_holiday1: number; ot_hours_holiday3: number; hourly_rate: number;
  commission_sales: number; commission_rate: number; commission_amount: number; diligence: number; bonus: number; other_income: number; other_income_note: string | null;
  late_minutes: number; deduct_late?: boolean; absent_days: number; unpaid_leave_days: number; sso_on: boolean; tax_method: TaxMethod; tax_manual: boolean;
  advance: number; other_deduct: number; other_deduct_note: string | null;
  ot_amount: number; late_deduct: number; absence_deduct: number; earnings: number; sso_base: number; sso_employee: number; sso_employer: number;
  tax_wht: number; total_deduct: number; net_pay: number; bank_name: string | null; bank_account: string | null; account_name: string | null; note: string | null;
}
export interface PayrollRun { id: string; period: string; pay_date: string | null; status: "draft" | "closed"; note: string | null; created_at: string; closed_at: string | null }

export const DEFAULT_SETTINGS: PayrollSettings = {
  sso_rate: 5, sso_min_base: 1650, sso_max_base: 17500, sso_start_month: "2027-01-01", days_per_month: 30, hours_per_day: 8,
  ot_weekday_mult: 1.5, holiday_work_mult: 1, ot_holiday_mult: 3, personal_allowance: 60000, expense_rate: 50, expense_cap: 100000, company_sso_no: null,
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** ภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได (ต่อปี) */
export function progressiveTax(net: number): number {
  const brackets: [number, number][] = [[150000, 0], [300000, 0.05], [500000, 0.1], [750000, 0.15], [1000000, 0.2], [2000000, 0.25], [5000000, 0.3], [Infinity, 0.35]];
  let tax = 0, prev = 0;
  for (const [top, rate] of brackets) {
    if (net <= prev) break;
    tax += (Math.min(net, top) - prev) * rate;
    prev = top;
  }
  return tax;
}

/** ปัดเศษเงินสมทบประกันสังคม: ต่ำกว่า 0.50 ทิ้ง · ตั้งแต่ 0.50 ปัดขึ้น */
const ssoRound = (x: number) => Math.floor(x + 0.5);

/** คำนวณทุกช่องผลลัพธ์จากช่องกรอก */
export function computeLine(input: PayrollLine, s: PayrollSettings, p: Pick<PayrollProfile, "tax_fixed" | "tax_extra_deduction" | "deduct_late"> | null): PayrollLine {
  const L = { ...input };
  const hourly = n(L.hourly_rate);
  const dayRate = n(L.salary) / n(s.days_per_month || 30);
  L.ot_amount = r2(hourly * (n(L.ot_hours_weekday) * n(s.ot_weekday_mult) + n(L.ot_hours_holiday1) * n(s.holiday_work_mult) + n(L.ot_hours_holiday3) * n(s.ot_holiday_mult)));
  if (n(L.commission_sales) > 0 && n(L.commission_rate) > 0) L.commission_amount = r2(n(L.commission_sales) * n(L.commission_rate) / 100);
  L.late_deduct = L.deduct_late === false || (L.deduct_late == null && p?.deduct_late === false) ? 0 : r2(n(L.late_minutes) * hourly / 60);
  L.absence_deduct = r2((n(L.absent_days) + n(L.unpaid_leave_days)) * dayRate);
  L.earnings = r2(n(L.salary) + n(L.position_allowance) + L.ot_amount + n(L.commission_amount) + n(L.diligence) + n(L.bonus) + n(L.other_income));

  // ประกันสังคม: ค่าจ้าง = เงินเดือน + ค่าตำแหน่ง + OT + คอมมิชชั่น − สาย − ขาด (ไม่รวมโบนัส/เบี้ยขยัน/รายได้อื่น)
  const wage = Math.max(0, n(L.salary) + n(L.position_allowance) + L.ot_amount + n(L.commission_amount) - L.late_deduct - L.absence_deduct);
  if (L.sso_on && wage > 0) {
    L.sso_base = r2(Math.min(Math.max(wage, n(s.sso_min_base)), n(s.sso_max_base)));
    L.sso_employee = ssoRound(L.sso_base * n(s.sso_rate) / 100);
    L.sso_employer = L.sso_employee;
  } else { L.sso_base = 0; L.sso_employee = 0; L.sso_employer = 0; }

  // ภาษีหัก ณ ที่จ่าย
  const taxable = Math.max(0, L.earnings - L.late_deduct - L.absence_deduct);
  if (!L.tax_manual) {
    if (L.tax_method === "none") L.tax_wht = 0;
    else if (L.tax_method === "flat3") L.tax_wht = r2(taxable * 0.03);
    else if (L.tax_method === "fixed") L.tax_wht = r2(n(p?.tax_fixed));
    else {
      // ภ.ง.ด.1 แบบประมาณการทั้งปี: รายได้ประจำ × 12 · โบนัสคิดภาษีส่วนเพิ่มในเดือนที่จ่าย
      const regular = Math.max(0, taxable - n(L.bonus));
      const annualTax = (income: number) => {
        const expense = Math.min(income * n(s.expense_rate) / 100, n(s.expense_cap));
        const net = income - expense - n(s.personal_allowance) - L.sso_employee * 12 - n(p?.tax_extra_deduction);
        return progressiveTax(Math.max(0, net));
      };
      const base = annualTax(regular * 12);
      const withBonus = annualTax(regular * 12 + n(L.bonus));
      L.tax_wht = r2(Math.max(0, base / 12 + (withBonus - base)));
    }
  }
  L.total_deduct = r2(L.late_deduct + L.absence_deduct + L.sso_employee + n(L.tax_wht) + n(L.advance) + n(L.other_deduct));
  L.net_pay = r2(L.earnings - L.total_deduct);
  return L;
}

/** ค่าแรงต่อชั่วโมง (สำหรับ OT/หักสาย) */
export const hourlyOf = (p: Pick<PayrollProfile, "base_salary" | "ot_hourly_rate">, s: PayrollSettings) =>
  p.ot_hourly_rate != null && p.ot_hourly_rate > 0 ? n(p.ot_hourly_rate) : r2(n(p.base_salary) / n(s.days_per_month || 30) / n(s.hours_per_day || 8));

export const ssoActive = (period: string, s: PayrollSettings) => period >= s.sso_start_month.slice(0, 10);

export const TAX_METHOD_TH: Record<TaxMethod, string> = { pnd1: "ภ.ง.ด.1 (ขั้นบันได ประมาณการทั้งปี)", flat3: "หัก 3% (ผู้รับจ้าง ภ.ง.ด.3)", fixed: "กำหนดยอดเองต่อเดือน", none: "ไม่หักภาษี" };
export const TH_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const periodLabel = (period: string) => `${TH_MONTHS_FULL[Number(period.slice(5, 7)) - 1]} ${Number(period.slice(0, 4)) + 543}`;
export const money = (v: number) => Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
