import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { PushToggle } from "@/components/work/PushToggle";
import { fmtDateTime } from "@/lib/format";
import { markAllRead } from "../actions";
import type { Notification } from "@/lib/work/types";
import { AtSign, Bell, Smartphone } from "lucide-react";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const mentions = tab === "mentions";
  const session = await getSession();
  const supabase = await createClient();
  let q = supabase.from("work_notifications").select("*, work_rooms(key, name)").eq("user_id", session.appUser.id);
  // หน้า "เรียกฉัน": kind = mention (0069) — ของเก่าก่อนรัน 0069 ดูจากข้อความ
  if (mentions) q = q.or("kind.eq.mention,message.like.*เอ่ยถึงคุณ*");
  const { data } = await q.order("created_at", { ascending: false }).limit(mentions ? 200 : 100);
  const rows = (data ?? []) as (Notification & { kind?: string | null; work_rooms?: { key: string; name: string } | null })[];
  const unreadMentions = mentions ? rows.filter((r) => !r.read_at).length : 0;
  const tabCls = (on: boolean) => `flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${on ? "bg-purple text-white" : "bg-white text-ink-soft border border-line hover:text-purple"}`;
  return (
    <div className="space-y-5">
      <Header crumbs={WORK} title={mentions ? "ข้อความที่เรียกฉัน" : "แจ้งเตือน"} action={<form action={markAllRead}><button className="btn-outline">อ่านทั้งหมดแล้ว</button></form>} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/work/notifications" className={tabCls(!mentions)}><Bell size={15} /> ทั้งหมด</Link>
        <Link href="/work/notifications?tab=mentions" className={tabCls(mentions)}><AtSign size={15} /> เรียกฉัน (@){unreadMentions > 0 && <span className="rounded-full bg-red text-white text-[11px] px-1.5">{unreadMentions}</span>}</Link>
        <Link href="/work/notifications/setup" className="ml-auto flex items-center gap-1.5 text-sm text-purple underline"><Smartphone size={15} /> เช็คการแจ้งเตือนเด้ง</Link>
      </div>
      {!mentions && <PushToggle compact />}
      {mentions && <p className="text-xs text-ink-soft">ทุกครั้งที่มีคน @ ถึงคุณในแชทห้องหรือคอมเมนต์งาน — กดแล้วพาไปที่ข้อความนั้นเลย · จุดแดง = ยังไม่ได้เปิดดู</p>}
      <ul className="card divide-y divide-line">
        {rows.map((n) => (
          <li key={n.id} className={`px-4 py-3 text-sm flex justify-between gap-3 ${n.read_at ? "text-ink-soft" : "font-semibold"}`}>
            <a href={`/work/notifications/open/${n.id}`} className="hover:underline min-w-0">
              {!n.read_at && <span className="inline-block h-2 w-2 rounded-full bg-red mr-2" />}
              {!mentions && n.kind === "mention" && <span className="mr-1">🔔</span>}
              {n.message}
            </a>
            <span className="text-xs text-ink-soft whitespace-nowrap">{fmtDateTime(n.created_at)}</span>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-8 text-center text-ink-soft text-sm">{mentions ? "ยังไม่มีใคร @ ถึงคุณ" : "ยังไม่มีการแจ้งเตือน"}</li>}
      </ul>
    </div>
  );
}
