export type SalesDocType = "quotation" | "temp_delivery" | "invoice" | "billing" | "receipt" | "credit_note" | "debit_note" | "purchase_req" | "purchase_order" | "purchase_request";
export type SalesDocStatus = "draft" | "issued" | "accepted" | "partial" | "paid" | "cancelled";
export type VatMode = "inclusive" | "exclusive" | "none";
export type SalesChannel = "store" | "corporate" | "online" | "export" | "intercompany" | "other";

export interface Company {
  signature_path?: string | null; stamp_path?: string | null;
  id: string; code: string; name_th: string; name_en: string | null; branch: string | null; address_th: string | null; address_en: string | null;
  tax_id: string | null; phone: string | null; mobile: string | null; email: string | null; website: string | null; vat_registered: boolean;
  bank_name: string | null; bank_branch: string | null; bank_account_name: string | null; bank_account_no: string | null; signer_name: string | null; doc_lang: string; is_active: boolean;
  doc_no_style?: string; intercompany_discount_pct?: number; logo_path?: string | null;
}

export interface SalesDoc {
  id: string; company_id: string; doc_type: SalesDocType; doc_no: string; doc_date: string; due_date: string | null; valid_until: string | null;
  customer_id: string | null; customer_name: string; customer_address: string | null; customer_tax_id: string | null; customer_branch: string | null;
  channel: SalesChannel; ref_doc_id: string | null; ref_doc_no: string | null; po_no: string | null; status: SalesDocStatus;
  vat_mode: VatMode; vat_rate: number; discount_pct: number; discount_amount: number; deposit_amount: number; deposit_ref: string | null; wht_pct: number;
  subtotal: number; discount_total: number; net_before_vat: number; vat_amount: number; grand_total: number; wht_amount: number; paid_total: number;
  payment_method: string | null; payment_date: string | null; payment_ref: string | null; deduct_stock: boolean; stock_issue_id: string | null;
  notes: string | null; internal_note: string | null; seller_name: string | null; source: string; created_by: string | null; created_at: string;
  companies?: Company | null; app_users?: { display_name: string | null } | null;
}
export interface SalesDocItem {
  id: string; doc_id: string; line_no: number; product_id: string | null; description: string; barcode: string | null; qty: number; unit: string | null;
  unit_price: number; discount_pct: number; amount: number; note: string | null;
}
export interface OnlineChannel { key: string; name: string; color: string; sort_order: number; is_active: boolean; bills_to_tks: boolean }
export interface OnlineItem { id: string; sale_date: string; channel: string; product_id: string | null; barcode: string | null; description: string | null; qty: number; unit_price: number; amount: number; order_ref: string | null }
export interface OnlineDaily { id: string; sale_date: string; channel: string; orders_count: number; gross_amount: number; fees: number; net_amount: number; recorded_tks: boolean; payout_amount?: number; note: string | null }

export const DOC_META: Record<SalesDocType, { prefix: string; th: string; en: string; color: string; sign: [string, string] }> = {
  quotation:     { prefix: "QT",  th: "ใบเสนอราคา",                          en: "Quotation",            color: "#452a79", sign: ["ผู้สั่งซื้อสินค้า", "ผู้อนุมัติ"] },
  temp_delivery: { prefix: "TD",  th: "ใบส่งของชั่วคราว",                      en: "Delivery Note",        color: "#06acb4", sign: ["ผู้รับสินค้า", "ผู้ส่งสินค้า"] },
  invoice:       { prefix: "INV", th: "ใบส่งสินค้า/ใบแจ้งหนี้/ใบกำกับภาษี",     en: "Invoice / Tax Invoice", color: "#00856b", sign: ["ผู้รับสินค้า / บริการ", "ผู้อนุมัติ"] },
  billing:       { prefix: "BL",  th: "ใบวางบิล/ใบแจ้งหนี้",                   en: "Billing Note",         color: "#e74f99", sign: ["ผู้รับวางบิล", "ผู้วางบิล"] },
  receipt:       { prefix: "RE",  th: "ใบเสร็จรับเงิน",                        en: "Receipt",              color: "#e42213", sign: ["ผู้รับสินค้า/ผู้รับบริการ", "ผู้รับเงิน"] },
  credit_note:   { prefix: "CN",  th: "ใบลดหนี้/ใบกำกับภาษี",                  en: "Credit Note",          color: "#0363b1", sign: ["ผู้รับสินค้า/ผู้รับบริการ", "ผู้อนุมัติ/ผู้รับสินค้าคืน"] },
  debit_note:    { prefix: "DN",  th: "ใบเพิ่มหนี้/ใบกำกับภาษี",                en: "Debit Note",           color: "#5f116e", sign: ["ผู้รับสินค้า/ผู้รับบริการ", "ผู้อนุมัติ"] },
  purchase_req:  { prefix: "PR",  th: "ใบเบิกซื้อสินค้า",                       en: "Purchase Requisition", color: "#1f3a5f", sign: ["ผู้ขอเบิก", "ผู้มีอำนาจลงนาม"] },
  purchase_order:   { prefix: "PO", th: "ใบสั่งซื้อ",                          en: "Purchase Order",        color: "#8a5a00", sign: ["ผู้ขาย", "ผู้อนุมัติ"] },
  purchase_request: { prefix: "PR", th: "ใบขอซื้อ (ภายใน)",                     en: "Purchase Request",      color: "#5b6b2f", sign: ["ผู้ขอซื้อ", "ผู้อนุมัติ"] },
};
export const STATUS_TH: Record<SalesDocStatus, string> = { draft: "ฉบับร่าง", issued: "ออกแล้ว", accepted: "ลูกค้ายืนยัน", partial: "รับชำระบางส่วน", paid: "รับชำระแล้ว", cancelled: "ยกเลิก" };
export const STATUS_BADGE: Record<SalesDocStatus, string> = { draft: "badge-off", issued: "badge-pending", accepted: "badge-ok", partial: "badge-pending", paid: "badge-approved", cancelled: "badge-rejected" };
export const CHANNEL_TH: Record<SalesChannel, string> = { store: "ห้างสรรพสินค้า", corporate: "Corporate / B2B", online: "ออนไลน์", export: "ต่างประเทศ", intercompany: "ระหว่างบริษัท", other: "อื่นๆ" };
export const VAT_TH: Record<VatMode, string> = { inclusive: "ราคารวม VAT (ถอด 7/107)", exclusive: "ราคาก่อน VAT (+7%)", none: "ไม่มี VAT" };

/** Next document in the chain */
export const NEXT_DOCS: Record<SalesDocType, SalesDocType[]> = {
  quotation: ["invoice", "temp_delivery", "billing"],
  temp_delivery: ["invoice", "receipt"],
  invoice: ["receipt", "billing", "credit_note", "debit_note"],
  billing: ["receipt"],
  receipt: [],
  credit_note: [],
  debit_note: ["receipt"],
  purchase_req: [],
  purchase_order: [],
  purchase_request: [],
};

export function thaiBaht(n: number): string {
  // อ่านจำนวนเงินเป็นภาษาไทย
  const num = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const pos = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const read = (s: string): string => {
    let out = "";
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const d = Number(s[i]); const p = len - i - 1;
      if (d === 0) continue;
      if (p === 0 && d === 1 && len > 1) out += "เอ็ด";
      else if (p === 1 && d === 2) out += "ยี่สิบ";
      else if (p === 1 && d === 1) out += "สิบ";
      else out += num[d] + pos[p];
    }
    return out;
  };
  const readInt = (s: string): string => {
    if (s.length <= 7) return read(s) || "ศูนย์";
    return readInt(s.slice(0, -6)) + "ล้าน" + (read(s.slice(-6)) || "");
  };
  const [i, f] = Math.abs(n).toFixed(2).split(".");
  const baht = readInt(i) + "บาท";
  return f === "00" ? baht + "ถ้วน" : baht + read(f) + "สตางค์";
}
