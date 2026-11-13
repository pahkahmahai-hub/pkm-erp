import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveDue, type Room, type Task } from "./types";
import { todayBkk } from "@/lib/format";

export const TASK_SELECT = "*, work_rooms(key, name, color), employees!work_tasks_assignee_id_fkey(first_name, nickname), app_users!work_tasks_created_by_fkey(display_name)";

/** Rooms visible to the user (RLS already filters tasks; rooms are listed for everyone, membership decides access) */
export async function myRooms(supabase: SupabaseClient, employeeId: string | null, isAdmin: boolean): Promise<Room[]> {
  const { data: rooms } = await supabase.from("work_rooms").select("*").eq("is_active", true).order("sort_order");
  if (isAdmin || !employeeId) return (rooms ?? []) as Room[];
  const [{ data: mem }, leads] = await Promise.all([
    supabase.from("work_room_members").select("room_id, is_lead").eq("employee_id", employeeId),
    myLeadRoomIds(supabase),
  ]);
  const member = new Set((mem ?? []).map((m) => m.room_id as string));
  const lead = new Set([...(mem ?? []).filter((m) => m.is_lead).map((m) => m.room_id as string), ...leads]);
  // หัวหน้าห้องหลักเห็นห้องย่อยของทีมด้วย (0028)
  return ((rooms ?? []) as Room[]).filter((r) => member.has(r.id) || lead.has(r.id)).map((r) => ({ ...r, is_lead: lead.has(r.id) }));
}

/** ห้องที่ฉันมีสิทธิ์หัวหน้า — รวมห้องย่อยของห้องหลักที่ฉันเป็น ★ (0028) */
export async function myLeadRoomIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_lead_room_ids");
  return error ? [] : ((data ?? []) as string[]);
}

/** สิทธิ์ในห้อง (ตรวจในฐานข้อมูล: สมาชิก / หัวหน้า รวมหัวหน้าห้องหลัก) */
export async function roomRights(supabase: SupabaseClient, roomId: string, isAdmin: boolean) {
  if (isAdmin) return { isMember: true, isLead: false };
  const [{ data: m }, { data: l }] = await Promise.all([supabase.rpc("is_room_member", { p_room: roomId }), supabase.rpc("is_room_lead", { p_room: roomId })]);
  return { isMember: !!m, isLead: !!l };
}

export function isOverdue(t: Task) {
  const due = effectiveDue(t);
  return !!due && due < todayBkk() && !["accepted", "cancelled", "done"].includes(t.status);
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

/** โหลดห้าง + สิทธิ์ของผู้ใช้ในห้อง (สมาชิก / หัวหน้า ★) — redirect ออกถ้าไม่ใช่สมาชิก */
export async function loadRoomAccess(supabase: SupabaseClient, key: string, session: { isAdmin: boolean; employee?: { id: string } | null }) {
  const { data: room } = await supabase.from("work_rooms").select("*").eq("key", key).maybeSingle();
  if (!room) return null;
  const rights = await roomRights(supabase, room.id, session.isAdmin);
  return { room: room as Room, ...rights };
}
