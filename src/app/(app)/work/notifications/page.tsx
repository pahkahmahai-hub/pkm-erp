import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { PushToggle } from "@/components/work/PushToggle";
import { fmtDateTime } from "@/lib/format";
import { markAllRead } from "../actions";
import type { Notification } from "@/lib/work/types";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

export default async function NotificationsPage() {
  const session = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("work_notifications").select("*, work_rooms(key)").eq("user_id", session.appUser.id).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as (Notification & { work_rooms?: { key: string } | null })[];
  return (
    <div className="space-y-6">
      <Header crumbs={WORK} title="แจ้งเตือน" action={<form action={markAllRead}><button className="btn-outline">อ่านทั้งหมดแล้ว</button></form>} />
      <PushToggle />
      <ul className="card divide-y divide-line">
        {rows.map((n) => (
          <li key={n.id} className={`px-4 py-3 text-sm flex justify-between gap-3 ${n.read_at ? "text-ink-soft" : "font-semibold"}`}>
            <Link href={n.task_id ? `/work/tasks/${n.task_id}` : n.work_rooms?.key ? `/work/rooms/${n.work_rooms.key}?tab=chat` : "/work"} className="hover:underline">{!n.read_at && <span className="inline-block h-2 w-2 rounded-full bg-red mr-2" />}{n.message}</Link>
            <span className="text-xs text-ink-soft whitespace-nowrap">{fmtDateTime(n.created_at)}</span>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-8 text-center text-ink-soft text-sm">ยังไม่มีการแจ้งเตือน</li>}
      </ul>
    </div>
  );
}
