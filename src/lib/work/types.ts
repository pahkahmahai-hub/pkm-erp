export type TaskStatus = "open" | "in_progress" | "done" | "accepted" | "returned" | "cancelled";
export type TaskPriority = "normal" | "urgent";

export interface Room { id: string; key: string; name: string; color: string; description: string | null; sort_order: number; is_active: boolean }
export interface RoomMember { room_id: string; employee_id: string; is_lead: boolean; employees?: { id: string; first_name: string; nickname: string | null; emp_code: string } | null }

export interface Task {
  id: string; task_no: number; room_id: string; title: string; description: string | null; assignee_id: string | null; created_by: string | null;
  due_date: string | null; priority: TaskPriority; status: TaskStatus; routine_id: string | null; routine_date: string | null;
  started_at: string | null; done_at: string | null; done_note: string | null; reviewed_at: string | null; review_note: string | null;
  created_at: string; updated_at: string;
  work_rooms?: Pick<Room, "key" | "name" | "color"> | null;
  employees?: { first_name: string; nickname: string | null } | null;
  app_users?: { display_name: string | null } | null;
}
export interface Checklist { id: string; task_id: string; label: string; is_done: boolean; done_at: string | null; sort_order: number }
export interface Comment {
  id: string; task_id: string; author_id: string | null; body: string | null; image_url: string | null; file_url: string | null; file_name: string | null; kind: string; created_at: string;
  app_users?: { display_name: string | null; email: string } | null;
}
export interface Routine { id: string; room_id: string; title: string; description: string | null; assignee_id: string | null; weekdays: number[]; is_active: boolean; work_rooms?: Pick<Room, "key" | "name" | "color"> | null; employees?: { first_name: string; nickname: string | null } | null }
export interface Notification { id: string; task_id: string | null; message: string; read_at: string | null; created_at: string }

export const STATUS_TH: Record<TaskStatus, string> = { open: "ใหม่", in_progress: "กำลังทำ", done: "รอตรวจรับ", accepted: "เสร็จสิ้น", returned: "ตีกลับ", cancelled: "ยกเลิก" };
export const STATUS_BADGE: Record<TaskStatus, string> = { open: "badge-off", in_progress: "badge-pending", done: "badge-ok", accepted: "badge-approved", returned: "badge-rejected", cancelled: "badge-off" };
export const DOW_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
