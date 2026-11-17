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
