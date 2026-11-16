import Link from "next/link";
import { Bell } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** ปุ่มแจ้งเตือน + จำนวนที่ยังไม่อ่าน (แสดงในแถบแท็บของทุกห้อง) */
export async function NotifBell() {
  const s = await getSession();
  const supabase = await createClient();
  const { count } = await supabase.from("work_notifications").select("id", { count: "exact", head: true }).eq("user_id", s.appUser.id).is("read_at", null);
  const n = count ?? 0;
  return (
    <Link href="/work/notifications" className={`${n ? "btn-primary" : "btn-outline"} py-1.5 px-4 relative`} title="แจ้งเตือน">
      <Bell size={16} /> แจ้งเตือน
      {n > 0 && <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-red text-white text-[11px] font-bold grid place-items-center">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
