import type { SupabaseClient } from "@supabase/supabase-js";
import type { Room, Task } from "./types";
import { todayBkk } from "@/lib/format";

export const TASK_SELECT = "*, work_rooms(key, name, color), employees!work_tasks_assignee_id_fkey(first_name, nickname), app_users!work_tasks_created_by_fkey(display_name)";

/** Rooms visible to the user (RLS already filters tasks; rooms are listed for everyone, membership decides access) */
export async function myRooms(supabase: SupabaseClient, employeeId: string | null, isAdmin: boolean): Promise<Room[]> {
  const { data: rooms } = await supabase.from("work_rooms").select("*").eq("is_active", true).order("sort_order");
  if (isAdmin || !employeeId) return (rooms ?? []) as Room[];
  const { data: mem } = await supabase.from("work_room_members").select("room_id").eq("employee_id", employeeId);
  const ids = new Set((mem ?? []).map((m) => m.room_id));
  return ((rooms ?? []) as Room[]).filter((r) => ids.has(r.id));
}

export function isOverdue(t: Task) {
  return !!t.due_date && t.due_date < todayBkk() && !["accepted", "cancelled", "done"].includes(t.status);
}

export async function ensureRoutines(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("generate_routine_tasks_ahead");   // 0018: วันนี้ + ล่วงหน้า 14 วัน (plan_ahead)
  if (error) await supabase.rpc("generate_routine_tasks");                // ก่อนรัน 0018
}

// ---------------------------------------------------------------------
// Staff can only read their own row in `employees` (HR privacy), so nested
// employees(...) joins come back null for everyone else. Use the public
// `employee_directory` view (safe columns, visible to all) to fill names.
export interface DirEmp { id: string; first_name: string; nickname: string | null; emp_code: string }
export async function loadDirectory(supabase: SupabaseClient): Promise<DirEmp[]> {
  const { data } = await supabase.from("employee_directory").select("id, first_name, nickname, emp_code").order("emp_code");
  return (data ?? []) as DirEmp[];
}
/** fill row.employees from the directory when the join returned null */
export function fillEmployees<T extends { employees?: unknown }>(rows: T[] | null | undefined, dir: DirEmp[], idKey: keyof T): T[] {
  const map = new Map(dir.map((e) => [e.id, e]));
  return (rows ?? []).map((r) => (r.employees ? r : { ...r, employees: map.get(r[idKey] as unknown as string) ?? null }));
}
