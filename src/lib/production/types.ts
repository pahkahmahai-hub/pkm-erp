import type { Company } from "@/lib/sales/types";
import type { MaterialKind } from "@/lib/stock/types";

export type MoStatus = "draft" | "issued" | "in_progress" | "partial" | "completed" | "cancelled";
export interface Bom { id: string; product_id: string; name: string; wage_per_piece: number; note: string | null; is_active: boolean; updated_at: string }
export interface BomItem { id: string; bom_id: string; material_id: string; qty_per_piece: number; pieces_per_unit: number | null; waste_pct: number; note: string | null; sort_order: number; materials?: { name: string; code: string | null; unit: string; kind: MaterialKind; qty: number; unit_cost?: number } | null }
export interface ProductionOrder {
  id: string; company_id: string; doc_no: string; doc_date: string; due_date: string | null; factory_id: string | null; factory_name: string | null; notes: string | null; internal_note: string | null;
  status: MoStatus; material_cost: number; wage_total: number; expense_id: string | null; created_by: string | null; created_at: string; updated_at: string; companies?: Company | null;
}
export interface ProductionOrderItem { id: string; order_id: string; line_no: number; product_id: string; bom_id: string | null; qty_ordered: number; qty_received: number; qty_defect: number; wage_per_piece: number; note: string | null; products?: { code: string; name: string; barcode: string | null; unit: string } | null }
export interface ProductionIssue { id: string; order_id: string; issue_no: string; issued_at: string; note: string | null; total_cost: number; production_issue_items?: { id: string; material_id: string; qty: number; unit_cost: number; materials?: { name: string; unit: string; kind: MaterialKind } | null }[] }
export interface ProductionReceipt { id: string; order_id: string; received_at: string; stock_receipt_id: string | null; lines: { item_id: string; qty_good: number; qty_defect: number }[]; note: string | null }
export interface Requirement { material_id: string; code: string | null; name: string; kind: MaterialKind; unit: string; stock: number; unit_cost: number; required: number; issued: number; remaining: number }

export const MO_STATUS_TH: Record<MoStatus, string> = { draft: "ฉบับร่าง", issued: "เบิกวัสดุแล้ว · รอผลิต", in_progress: "กำลังผลิต", partial: "รับบางส่วน", completed: "เสร็จสิ้น", cancelled: "ยกเลิก" };
export const MO_STATUS_BADGE: Record<MoStatus, string> = { draft: "badge-off", issued: "badge-pending", in_progress: "badge-pending", partial: "badge-ok", completed: "badge-approved", cancelled: "badge-rejected" };
export const KIND_TH: Record<MaterialKind, string> = { fabric: "ลายผ้า", packaging: "แพคเกจจิ้ง", accessory: "อุปกรณ์", display: "อุปกรณ์ Display" };
