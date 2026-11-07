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
  await supabase.rpc("generate_routine_tasks");
}
