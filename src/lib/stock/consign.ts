// คลังฝากขาย (0024)
export interface ConsignLocation { id: string; name: string; contact_ids: string[]; color: string; note: string | null; is_active: boolean; sort_order: number }
export interface ConsignStockRow { location_id: string; product_id: string; qty: number; updated_at: string; products?: { id: string; code: string; name: string; unit: string; price: number; cost?: number | null; stock_qty: number } | null }
export interface ConsignMove { id: string; location_id: string; product_id: string; kind: "in" | "sale" | "return" | "adjust" | "reverse"; qty: number; balance_after: number; ref_type: string | null; ref_id: string | null; ref_no: string | null; note: string | null; created_at: string; products?: { code: string; name: string } | null }
export const KIND_TH: Record<ConsignMove["kind"], string> = { in: "ส่งเข้าห้าง (TD)", sale: "ขายได้ (ใบกำกับ)", return: "รับคืน", adjust: "กระทบยอด", reverse: "ยกเลิกเอกสาร" };
