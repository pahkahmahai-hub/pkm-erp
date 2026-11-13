import type { VatMode } from "@/lib/sales/types";

export type ExpenseStatus = "draft" | "pending" | "approved" | "rejected" | "paid" | "cancelled";

export interface ExpenseCategory { id: string; code: string; name: string; wht_pct: number; wht_income_type: string | null; sort_order: number; is_active: boolean }

export interface Expense {
  id: string; company_id: string; exp_no: string; supplier_id: string | null; supplier_name: string; supplier_tax_id: string | null; supplier_address: string | null; supplier_branch: string | null;
  supplier_is_company: boolean; category_id: string | null; bill_no: string | null; bill_date: string; due_date: string | null; description: string | null;
  vat_mode: VatMode; vat_rate: number; discount_amount: number; wht_pct: number;
  subtotal: number; net_before_vat: number; vat_amount: number; grand_total: number; wht_amount: number; net_pay: number;
  status: ExpenseStatus; pay_round: string | null; paid_date: string | null; paid_method: string | null; paid_ref: string | null;
  approved_by: string | null; approved_at: string | null; review_note: string | null; ai_extracted: AiBill | null; note: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface ExpenseItem { id: string; expense_id: string; line_no: number; description: string; qty: number; unit: string | null; unit_price: number; amount: number; material_id: string | null; product_id: string | null }
export interface ExpenseFile { id: string; expense_id: string; path: string; kind: string; created_at: string }
export interface WhtCertificate {
  id: string; company_id: string; cert_no: string; expense_id: string | null; form: "pnd3" | "pnd53" | "pnd1" | "pnd1a"; payroll_line_id?: string | null; payroll_year?: number | null; sso_amount?: number | null; payee_name: string; payee_tax_id: string | null; payee_address: string | null;
  pay_date: string; income_type: string | null; income_amount: number; wht_pct: number; wht_amount: number; created_at: string;
  income_row: number; payer_condition: number; note: string | null; payee_branch: string | null;
}

/** What the AI returns from a bill image (all fields optional — human verifies). */
export interface AiBill {
  doc_kind?: "tax_invoice" | "cash_bill" | "receipt" | "quotation" | "invoice" | "other";
  supplier_name?: string | null; supplier_tax_id?: string | null; supplier_address?: string | null; supplier_branch?: string | null; supplier_is_company?: boolean | null; supplier_phone?: string | null;
  bill_no?: string | null; bill_date?: string | null; due_date?: string | null;
  vat_mode?: VatMode | null;
  items?: { description: string; qty: number | null; unit?: string | null; unit_price: number | null; amount: number | null }[];
  subtotal?: number | null; discount_amount?: number | null; vat_amount?: number | null; grand_total?: number | null;
  wht_pct?: number | null; wht_amount?: number | null; net_pay?: number | null;
  handwritten?: boolean; confidence?: number; warnings?: string[]; notes?: string | null;
}

export const STATUS_TH: Record<ExpenseStatus, string> = { draft: "ฉบับร่าง", pending: "รออนุมัติ", approved: "อนุมัติแล้ว · รอจ่าย", rejected: "ไม่อนุมัติ", paid: "จ่ายแล้ว", cancelled: "ยกเลิก" };
export const STATUS_BADGE: Record<ExpenseStatus, string> = { draft: "badge-off", pending: "badge-pending", approved: "badge-ok", rejected: "badge-rejected", paid: "badge-approved", cancelled: "badge-rejected" };
export const PAY_METHODS = ["โอน", "เงินสด", "เช็ค", "บัตรเครดิต", "หักกลบ"];
export const WHT_CHOICES = [0, 1, 2, 3, 5];

/** Next payment round after a date: the 15th or the 1st of next month. */
export function nextPayRound(fromIso: string): string {
  const d = new Date(fromIso + "T00:00:00");
  const day = d.getDate();
  const r = day < 15 ? new Date(d.getFullYear(), d.getMonth(), 15) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, "0")}-${String(r.getDate()).padStart(2, "0")}`;
}
