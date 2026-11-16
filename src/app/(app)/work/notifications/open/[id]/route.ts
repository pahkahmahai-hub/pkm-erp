import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** กดแจ้งเตือน 1 รายการ → ทำเครื่องหมายอ่านแล้ว (รายการนั้น) แล้วพาไปหน้าที่เกี่ยวข้อง */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const supabase = await createClient();
  const { data: n } = await supabase.from("work_notifications").select("id, task_id, work_rooms(key)").eq("id", id).eq("user_id", s.appUser.id).maybeSingle();
  if (n) await supabase.from("work_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  const x = n as { task_id: string | null; work_rooms: { key: string } | null } | null;
  const to = x?.task_id ? `/work/tasks/${x.task_id}` : x?.work_rooms?.key ? `/work/rooms/${x.work_rooms.key}?tab=chat` : "/work/notifications";
  return NextResponse.redirect(new URL(to, req.url));
}
