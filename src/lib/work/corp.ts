// ออเดอร์ลูกค้า Corporate (0034) — types + labels (shared server/client)

export type CorpStatus = "confirm" | "producing" | "ready" | "partial" | "delivered" | "cancelled";
export type CorpPay = "none" | "deposit" | "awaiting" | "paid";

export interface CorpOrder {
  id: string; order_no: string; customer_name: string; customer_label: string | null; contact_id: string | null; contact_person: string | null; contact_phone: string | null;
  title: string; detail: string | null; amount: number; order_date: string; supplier_due: string | null; due_date: string | null;
  status: CorpStatus; pay_status: CorpPay; doc_qt: string | null; doc_bill: string | null; doc_iv: string | null; doc_dr: string | null; doc_cn: string | null; docs_original_sent: boolean;
  owner_id: string | null; note: string | null; delivered_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface CorpShipment { id: string; order_id: string; ship_date: string; qty_note: string; note: string | null; created_by: string | null; created_at: string }
export interface CorpFile { id: string; order_id: string; url: string; name: string | null; is_image: boolean; created_by: string | null; created_at: string }
export interface CorpLog { id: number; order_id: string; at: string; by_user: string | null; message: string; app_users?: { display_name: string | null; email: string } | null }

export const CORP_STATUS: { key: CorpStatus; label: string; bg: string; fg: string }[] = [
  { key: "confirm",   label: "รอคอนเฟิร์ม",      bg: "#fff3bf", fg: "#6b4f00" },
  { key: "producing", label: "สั่งผลิต",          bg: "#d0ebff", fg: "#0b3d6b" },
  { key: "ready",     label: "ผลิตเสร็จ/รอส่ง",   bg: "#e5dbff", fg: "#3b2470" },
  { key: "partial",   label: "ส่งบางส่วน",        bg: "#ffd8a8", fg: "#7a3d00" },
  { key: "delivered", label: "ส่งครบแล้ว",        bg: "#b2f2bb", fg: "#1b5e2a" },
  { key: "cancelled", label: "ยกเลิก",            bg: "#e9ecef", fg: "#495057" },
];
export const CORP_PAY: { key: CorpPay; label: string; cls: string }[] = [
  { key: "none",     label: "ยังไม่มัดจำ",       cls: "bg-red/10 text-red" },
  { key: "deposit",  label: "มัดจำแล้ว",         cls: "bg-yellow/30 text-[#6b4f00]" },
  { key: "awaiting", label: "ส่งของแล้ว รอชำระ", cls: "bg-coral/15 text-coral" },
  { key: "paid",     label: "จ่ายครบ",           cls: "bg-green/15 text-green" },
];
export const corpStatus = (s: CorpStatus) => CORP_STATUS.find((x) => x.key === s) ?? CORP_STATUS[0];
export const corpPay = (s: CorpPay) => CORP_PAY.find((x) => x.key === s) ?? CORP_PAY[0];
export const corpOpen = (o: Pick<CorpOrder, "status">) => o.status !== "delivered" && o.status !== "cancelled";
export const corpOverdue = (o: Pick<CorpOrder, "status" | "due_date">, today: string) => corpOpen(o) && !!o.due_date && o.due_date < today;
export const corpName = (o: Pick<CorpOrder, "customer_name" | "customer_label">) => o.customer_label || o.customer_name;
export const baht = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
