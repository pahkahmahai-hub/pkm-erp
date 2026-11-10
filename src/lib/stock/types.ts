export type ContactKind = "customer" | "supplier";
export interface Contact {
  id: string; kind: ContactKind; code: string | null; entity_type: string; country: string; name: string;
  address: string | null; address2: string | null; address3: string | null; postcode: string | null;
  tax_id: string | null; branch_code: string | null; branch_name: string | null;
  contact_name: string | null; email: string | null; mobile: string | null; office_phone: string | null;
  credit_days: number; note: string | null; is_active: boolean;
}

export interface Product {
  id: string; code: string; barcode: string | null; name: string; dept: string | null; sub_dept: string | null;
  unit: string; price: number; cost: number | null; stock_qty: number; defect_qty: number; min_alert: number;
  image_url: string | null; notes: string | null; is_active: boolean; sort_order: number | null; updated_at: string;
}

export type MovementType = "opening" | "receive" | "issue" | "adjust" | "defect_in" | "defect_restore" | "defect_return" | "defect_dispose";
export interface Movement {
  id: string; product_id: string; movement_type: MovementType; qty: number; defect_delta: number; balance_after: number;
  ref_table: string | null; ref_id: string | null; ref_no: string | null; note: string | null; created_by: string | null; created_at: string;
  products?: Pick<Product, "code" | "name" | "barcode"> | null;
  app_users?: { display_name: string | null; email: string } | null;
}

export interface Receipt {
  id: string; receipt_no: string; receipt_date: string; supplier_id: string | null; supplier_doc_no: string | null;
  payment_status: "unpaid" | "paid"; paid_at: string | null; note: string | null; total_good: number; total_defect: number;
  created_by: string | null; created_at: string;
  contacts?: Pick<Contact, "name"> | null; app_users?: { display_name: string | null } | null;
}
export interface ReceiptItem {
  id: string; receipt_id: string; product_id: string; qty: number; condition: "good" | "defect";
  defect_action: DefectStatus | null; unit_cost: number | null; note: string | null;
  products?: Pick<Product, "code" | "name"> | null;
}

export interface Issue {
  id: string; issue_no: string; issue_date: string; customer_id: string | null; source: string; source_doc_no: string | null;
  purpose: string | null; total_qty: number; created_by: string | null; created_at: string;
  contacts?: Pick<Contact, "name"> | null; app_users?: { display_name: string | null } | null;
}
export interface IssueItem { id: string; issue_id: string; product_id: string; qty: number; note: string | null; products?: Pick<Product, "code" | "name"> | null }

export type DefectStatus = "review" | "return_pending" | "returned" | "disposed" | "restored";
export interface Defect {
  id: string; product_id: string; qty: number; status: DefectStatus; receipt_id: string | null; supplier_id: string | null;
  note: string | null; created_at: string; updated_at: string;
  products?: Pick<Product, "code" | "name"> | null; contacts?: Pick<Contact, "name"> | null;
  receipts?: Pick<Receipt, "receipt_no"> | null; app_users?: { display_name: string | null } | null;
}

export type MaterialKind = "fabric" | "packaging" | "accessory";
export interface Material {
  id: string; kind: MaterialKind; code: string | null; name: string; unit: string; qty: number; min_alert: number; unit_cost?: number;
  image_url: string | null; note: string | null; is_active: boolean; updated_at: string;
}
export interface MaterialMovement {
  id: string; material_id: string; movement_type: string; qty: number; balance_after: number; note: string | null; created_at: string;
  app_users?: { display_name: string | null } | null;
}

export const MOVEMENT_TH: Record<MovementType, string> = {
  opening: "ยอดยกมา", receive: "รับเข้า", issue: "เบิกออก", adjust: "ปรับยอด",
  defect_in: "รับเป็นของเสีย", defect_restore: "ของเสียกลับเข้าสต็อก", defect_return: "ส่งคืนซัพพลายเออร์", defect_dispose: "ตัดทิ้ง",
};
export const DEFECT_TH: Record<DefectStatus, string> = {
  review: "รอพิจารณา", return_pending: "รอส่งคืน", returned: "ส่งคืนแล้ว", disposed: "ตัดทิ้งแล้ว", restored: "กลับเข้าสต็อกแล้ว",
};
export const MATERIAL_TH: Record<MaterialKind, { name: string; unit: string }> = {
  fabric: { name: "ลายผ้า", unit: "ผืน" },
  packaging: { name: "แพคเกจจิ้ง", unit: "ชิ้น" },
  accessory: { name: "อุปกรณ์", unit: "ชิ้น" },
};
