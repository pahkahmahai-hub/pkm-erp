// ตารางส่งสินค้าห้าง — types, step meta, week helpers (shared server/client)

export interface DeliveryStore { id: string; name: string; short_name: string | null; group_name: string | null; contact_id: string | null; color: string; sort_order: number; is_active: boolean; closed_at: string | null }
export interface StepLogEntry { step: number; at: string; by: string | null; auto?: boolean }
export interface StoreDelivery {
  id: string; store_id: string; week_start: string; target_date: string | null; step: number; doc_no: string | null; sales_doc_id: string | null; po_no: string | null;
  assignee_id: string | null; note: string | null; step_log: StepLogEntry[]; created_by: string | null; created_at: string; updated_at: string;
  employees?: { id: string; first_name: string; nickname: string | null } | null;
}

/** 7 ขั้นตอน — สี: 1-2 เหลือง (เตรียม), 3-4 ฟ้า (จัดสินค้า), 5-6 ม่วง (ส่ง/อัพระบบ), 7 เขียว (ถึงแล้ว) */
export const STEPS: { n: number; label: string; short: string; bg: string; fg: string }[] = [
  { n: 1, label: "สั่งจัดสินค้าส่งห้าง", short: "สั่งจัด",     bg: "#fff3bf", fg: "#6b4f00" },
  { n: 2, label: "ส่งลิสต์รายการแล้ว",  short: "ส่งลิสต์",    bg: "#ffe066", fg: "#5a3f00" },
  { n: 3, label: "ออกใบจัดสินค้า/ใบส่งของ (ตัดสต็อกแล้ว)", short: "ออกใบส่งของ", bg: "#d0ebff", fg: "#0b3d6b" },
  { n: 4, label: "จัดสินค้าเสร็จ",      short: "จัดเสร็จ",    bg: "#74c0fc", fg: "#062a4d" },
  { n: 5, label: "ส่งสินค้าแล้ว",       short: "ส่งแล้ว",     bg: "#e5dbff", fg: "#3b2470" },
  { n: 6, label: "อัพเข้าระบบห้างแล้ว", short: "อัพระบบ",     bg: "#b197fc", fg: "#2a1757" },
  { n: 7, label: "สินค้าถึงห้างแล้ว",   short: "ถึงแล้ว",     bg: "#b2f2bb", fg: "#1b5e2a" },
];
export const stepMeta = (n: number) => STEPS[Math.min(Math.max(n, 1), 7) - 1];

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(s + "T00:00:00Z");
/** Monday of the week containing the given yyyy-mm-dd */
export function mondayOf(s: string): string { const d = parse(s); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return ymd(d); }
export function addDays(s: string, n: number): string { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
export function addMonths(ym: string, n: number): string { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
export const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const fmtDM = (s: string) => { const d = parse(s); return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`; };

export interface WeekCol { start: string; end: string; month: string; label: string }
/** weeks (Mon–Sun) whose Monday falls in months [fromYm .. toYm]; each week is assigned to the month of its Monday */
export function weekColumns(fromYm: string, toYm: string): WeekCol[] {
  const out: WeekCol[] = [];
  let w = mondayOf(fromYm + "-01");
  if (w < fromYm + "-01") w = addDays(w, 7);
  const [ty, tm] = toYm.split("-").map(Number);
  const endExcl = ymd(new Date(Date.UTC(ty, tm, 1)));
  while (w < endExcl) { out.push({ start: w, end: addDays(w, 6), month: w.slice(0, 7), label: fmtDM(w) }); w = addDays(w, 7); }
  return out;
}
export const monthOf = (s: string) => s.slice(0, 7);
