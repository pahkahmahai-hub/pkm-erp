import type { VatMode, Company, SalesDoc, SalesDocItem } from "@/lib/sales/types";

export type PurchaseDocType = "pr" | "po";
export type PurchaseStatus = "draft" | "pending" | "approved" | "rejected" | "ordered" | "sent" | "partial" | "received" | "closed" | "cancelled";

export interface PurchaseDoc {
  id: string; company_id: string; doc_type: PurchaseDocType; doc_no: string; doc_date: string; need_by: string | null;
  supplier_id: string | null; supplier_name: string | null; supplier_tax_id: string | null; supplier_address: string | null; supplier_branch: string | null;
  purpose: string | null; notes: string | null; internal_note: string | null; vat_mode: VatMode; vat_rate: number; discount_pct: number; discount_amount: number;
  subtotal: number; net_before_vat: number; vat_amount: number; grand_total: number; status: PurchaseStatus; ref_doc_id: string | null; ref_doc_no: string | null;
  approved_by: string | null; approved_at: string | null; review_note: string | null; expense_id: string | null; buyer_name: string | null;
  created_by: string | null; created_at: string; updated_at: string; companies?: Company | null;
}
export interface PurchaseItem {
  id: string; doc_id: string; line_no: number; product_id: string | null; material_id: string | null; description: string; detail: string | null;
  qty: number; unit: string; unit_price: number; discount_pct: number; amount: number; received_qty: number;
}
export interface PurchaseReceipt { id: string; doc_id: string; received_at: string; stock_receipt_id: string | null; lines: { item_id: string; qty: number }[]; note: string | null; created_at: string }

export const PSTATUS_TH: Record<PurchaseStatus, string> = {
  draft: "ฉบับร่าง", pending: "รออนุมัติ", approved: "อนุมัติแล้ว · รอเปิด PO", rejected: "ไม่อนุมัติ", ordered: "เปิด PO แล้ว",
  sent: "ส่งซัพพลายเออร์แล้ว · รอของ", partial: "รับของบางส่วน", received: "รับของครบ", closed: "ปิดงาน", cancelled: "ยกเลิก",
};
export const PSTATUS_BADGE: Record<PurchaseStatus, string> = {
  draft: "badge-off", pending: "badge-pending", approved: "badge-ok", rejected: "badge-rejected", ordered: "badge-approved",
  sent: "badge-pending", partial: "badge-ok", received: "badge-approved", closed: "badge-off", cancelled: "badge-rejected",
};

/** Map a purchase doc onto the sales DocSheet shape so PR/PO print with the same FlowAccount-style layout. */
export function toSheet(d: PurchaseDoc, items: PurchaseItem[]): { doc: SalesDoc; lines: SalesDocItem[] } {
  const doc = {
    id: d.id, company_id: d.company_id, doc_type: d.doc_type === "po" ? "purchase_order" : "purchase_request", doc_no: d.doc_no, doc_date: d.doc_date, due_date: d.need_by, valid_until: null,
    customer_id: d.supplier_id, customer_name: d.supplier_name ?? "—", customer_address: d.supplier_address, customer_tax_id: d.supplier_tax_id, customer_branch: d.supplier_branch,
    channel: "corporate", ref_doc_id: d.ref_doc_id, ref_doc_no: d.ref_doc_no, po_no: null, status: "issued", vat_mode: d.vat_mode, vat_rate: d.vat_rate, discount_pct: d.discount_pct, discount_amount: d.discount_amount,
    deposit_amount: 0, deposit_ref: null, wht_pct: 0, subtotal: d.subtotal, discount_total: Number(d.discount_amount) + Math.round(Number(d.subtotal) * Number(d.discount_pct)) / 100,
    net_before_vat: d.net_before_vat, vat_amount: d.vat_amount, grand_total: d.grand_total, wht_amount: 0, paid_total: 0, payment_method: null, payment_date: null, payment_ref: null,
    deduct_stock: false, stock_issue_id: null, notes: [d.purpose ? `วัตถุประสงค์: ${d.purpose}` : null, d.notes].filter(Boolean).join("\n") || null, internal_note: d.internal_note, seller_name: d.buyer_name,
    source: "purchase", created_by: d.created_by, created_at: d.created_at, companies: d.companies ?? null,
  } as unknown as SalesDoc;
  const lines = items.map((i) => ({ id: i.id, doc_id: i.doc_id, line_no: i.line_no, product_id: i.product_id, description: i.description + (i.detail ? "\n" + i.detail : ""), barcode: null, qty: i.qty, unit: i.unit, unit_price: i.unit_price, discount_pct: i.discount_pct, amount: i.amount, note: null })) as SalesDocItem[];
  return { doc, lines };
}
