"use server";

import { createClient } from "@/lib/supabase/server";

export interface RoomUnread { key: string; name: string; color: string; unread: number; last_at: string | null }

/** ห้องแชทที่ฉันเป็นสมาชิก + จำนวนข้อความที่ยังไม่อ่าน (0061) */
export async function myRoomUnread(): Promise<RoomUnread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_room_unread");
  if (error) return [];
  return (data ?? []) as RoomUnread[];
}

/** ตัวเลขบนไอคอนแอป = แจ้งเตือนที่ยังไม่อ่าน + ข้อความแชทห้องที่ยังไม่อ่าน */
export async function badgeCount(): Promise<number> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;
  const [{ data: me }, rooms] = await Promise.all([supabase.from("app_users").select("id").eq("auth_user_id", auth.user.id).maybeSingle(), myRoomUnread()]);
  let n = rooms.reduce((a, r) => a + (r.unread || 0), 0);
  if (me?.id) {
    const { count } = await supabase.from("work_notifications").select("id", { count: "exact", head: true }).eq("user_id", me.id).is("read_at", null);
    n += count ?? 0;
  }
  return n;
}
