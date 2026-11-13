export type TaskStatus = "open" | "in_progress" | "done" | "prep" | "shipped" | "arrived" | "accepted" | "returned" | "cancelled";
export type TaskPriority = "normal" | "urgent";

export interface Room { id: string; key: string; name: string; color: string; description: string | null; sort_order: number; is_active: boolean; is_lead?: boolean }
export interface RoomMember { room_id: string; employee_id: string; is_lead: boolean; employees?: { id: string; first_name: string; nickname: string | null; emp_code: string } | null }

export interface Task {
  id: string; task_no: number; room_id: string; title: string; description: string | null; assignee_id: string | null; created_by: string | null;
  due_date: string | null; priority: TaskPriority; status: TaskStatus; routine_id: string | null; routine_date: string | null;
  start_date?: string | null; due_time?: string | null; topic_id?: string | null;
  arrive_due?: string | null; arrived_at?: string | null;   // SW ROOM (0029)
  work_topics?: Pick<Topic, "id" | "name" | "color"> | null;
  started_at: string | null; done_at: string | null; done_note: string | null; reviewed_at: string | null; review_note: string | null;
  created_at: string; updated_at: string;
  work_rooms?: Pick<Room, "key" | "name" | "color"> | null;
  employees?: { first_name: string; nickname: string | null } | null;
  app_users?: { display_name: string | null } | null;
}
export interface Topic { id: string; room_id: string; employee_id: string | null; name: string; color: string; sort_order: number; is_active: boolean }
export interface TaskFile { id: string; task_id: string; url: string; name: string | null; caption: string | null; sort_order: number; created_by: string | null; created_at: string }
export type RoutineRule = "weekly" | "monthly" | "first_week" | "double_day";
export const RULE_TH: Record<RoutineRule, string> = { weekly: "ทุกสัปดาห์ (เลือกวัน)", monthly: "ทุกเดือน (เลือกวันที่)", first_week: "สัปดาห์แรกของเดือน (เลือกวัน)", double_day: "วันเบิ้ล 1/1 … 12/12" };
export interface Checklist { id: string; task_id: string; label: string; is_done: boolean; done_at: string | null; sort_order: number }
export interface Comment {
  id: string; task_id: string; author_id: string | null; body: string | null; image_url: string | null; file_url: string | null; file_name: string | null; kind: string; created_at: string;
  app_users?: { display_name: string | null; email: string } | null;
}
export interface Routine { id: string; room_id: string; title: string; description: string | null; assignee_id: string | null; weekdays: number[]; is_active: boolean;
  rule?: RoutineRule; month_days?: number[] | null; due_friday?: boolean; due_time?: string | null; topic_id?: string | null; plan_ahead?: boolean; priority?: TaskPriority; work_topics?: Pick<Topic, "id" | "name" | "color"> | null; work_rooms?: Pick<Room, "key" | "name" | "color"> | null; employees?: { first_name: string; nickname: string | null } | null }
export interface Notification { id: string; task_id: string | null; message: string; read_at: string | null; created_at: string }

export const STATUS_TH: Record<TaskStatus, string> = { open: "ใหม่", in_progress: "กำลังทำ", done: "รอตรวจรับ", prep: "เตรียมส่ง", shipped: "ส่งสินค้าแล้ว", arrived: "สินค้าถึงแล้ว", accepted: "เสร็จสิ้น", returned: "ตีกลับ", cancelled: "ยกเลิก" };
/** SW ROOM: ขั้นส่งห้างต่อจากรอตรวจรับ — accepted = เข้าระบบเรียบร้อย */
export const SW_STAGES: TaskStatus[] = ["prep", "shipped", "arrived"];
export const statusLabel = (s: TaskStatus, roomKey?: string | null) => (roomKey === "sw-room" && s === "accepted" ? "อัพเข้าระบบเรียบร้อย" : STATUS_TH[s]);
export const STATUS_BADGE: Record<TaskStatus, string> = { open: "badge-off", in_progress: "badge-pending", done: "badge-ok", prep: "badge-pending", shipped: "badge-ok", arrived: "badge-ok", accepted: "badge-approved", returned: "badge-rejected", cancelled: "badge-off" };
// ---------- SW ROOM: กำหนด 3 ระยะ (0029) ----------
export type SwPhase = "pack" | "arrive" | "system";
export interface SwDeadline { phase: SwPhase; label: string; short: string; date: string | null; estimated?: boolean }
const addD = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10) + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
const bkkDate = (ts: string) => new Date(Date.parse(ts) + 7 * 3600_000).toISOString().slice(0, 10);
/** ① จัดเสร็จ ② ถึงห้าง ③ อัพเข้าระบบ (ของถึงจริง + 7 วัน; ก่อนถึง = ② + 7 แบบคาดการณ์) */
export function swDeadlines(t: Pick<Task, "due_date" | "arrive_due" | "arrived_at">): SwDeadline[] {
  const arrive = t.arrive_due ?? (t.due_date ? addD(t.due_date, 2) : null);
  const system = t.arrived_at ? addD(bkkDate(t.arrived_at), 7) : arrive ? addD(arrive, 7) : null;
  return [
    { phase: "pack", label: "จัดของเสร็จ", short: "จัด", date: t.due_date },
    { phase: "arrive", label: "ส่งถึงห้าง", short: "ถึงห้าง", date: arrive },
    { phase: "system", label: "อัพเข้าระบบ (PC)", short: "เข้าระบบ", date: system, estimated: !t.arrived_at },
  ];
}
/** ระยะที่กำลังต้องตามตอนนี้ ตามสถานะงาน (null = ปิดแล้ว) */
export function swCurrentPhase(status: TaskStatus): SwPhase | null {
  if (["open", "in_progress", "returned"].includes(status)) return "pack";
  if (["done", "prep", "shipped"].includes(status)) return "arrive";
  if (status === "arrived") return "system";
  return null;
}
/** กำหนดที่ใช้ตัดสิน "เลยกำหนด" — SW ROOM ใช้ระยะปัจจุบัน ห้องอื่นใช้ due_date */
export function effectiveDue(t: Task): string | null {
  if (t.work_rooms?.key !== "sw-room") return t.due_date;
  const ph = swCurrentPhase(t.status);
  return ph ? swDeadlines(t).find((d) => d.phase === ph)?.date ?? null : null;
}

export const DOW_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

// ปฏิทินบริษัท (0020)
export interface EventCategory { id: string; key: string; name: string; color: string; sort_order: number; is_active: boolean }
export interface CompanyEvent {
  id: string; title: string; category_id: string | null; start_date: string; end_date: string; start_time: string | null; end_time: string | null; location: string | null; note: string | null;
  recur: "weekly" | "monthly" | null; recur_until: string | null; created_by: string | null; created_at: string; updated_at: string;
  event_categories?: EventCategory | null;
}

// โน้ต / แกลเลอรี (0025)
export interface Note { id: string; room_id: string; title: string; body: string | null; color: string; pinned: boolean; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string; work_note_files?: NoteFile[]; app_users?: { display_name: string | null; email: string } | null }
export interface NoteFile { id: string; note_id: string; url: string; name: string | null; is_image: boolean; sort_order: number }
export interface Album { id: string; room_id: string; title: string; description: string | null; event_date: string | null; cover_url: string | null; created_by: string | null; created_at: string; updated_at: string; work_album_photos?: { count: number }[] }
export interface AlbumPhoto { id: string; album_id: string; url: string; caption: string | null; sort_order: number; created_by: string | null; created_at: string; app_users?: { display_name: string | null } | null }
export const NOTE_COLORS = ["#fff8e6", "#eaf7ef", "#e8f1fb", "#f3ecfb", "#fdecef", "#ffffff"];
