import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { MonthCalendar, expandEvents } from "@/components/work/MonthCalendar";
import type { CompanyEvent, EventCategory } from "@/lib/work/types";
import { addMonths, addDays, fmtDM, TH_MONTHS } from "@/lib/work/deliveries";
import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: "/work/rooms/teamwork", label: "TEAMWORK" }];

export default async function CompanyCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const today = todayBkk();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const from = addDays(month + "-01", -7); const to = addDays(addMonths(month, 1) + "-01", 13);
  const [{ data: cats }, { data: evs }] = await Promise.all([
    supabase.from("event_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("company_events").select("*, event_categories(*)").or(`and(start_date.lte.${to},end_date.gte.${from}),recur.not.is.null`).order("start_date"),
  ]);
  const events = (evs ?? []) as CompanyEvent[];
  const upcoming = expandEvents(events, today, addDays(today, 30)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);
  const [y, m] = month.split("-").map(Number);
  const href = (ym: string) => `/work/company-calendar?month=${ym}`;
  return (
    <div className="space-y-4">
      <Header crumbs={WORK} title="ปฏิทินบริษัท" sub="ออกบูธห้าง · นัดหมายสำคัญ · ลูกค้าเข้า showroom · ประชุมประจำสัปดาห์/เดือน · กิจกรรม 5ส — ทุกคนเห็นพร้อมกัน" action={<Link href="/work/rooms/teamwork" className="btn-outline"><Users size={16} /> TEAMWORK</Link>} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={href(addMonths(month, -1))} className="btn-outline py-1 px-2"><ChevronLeft size={16} /></Link>
        <Link href={href(today.slice(0, 7))} className="btn-outline py-1 px-3 text-xs">เดือนนี้</Link>
        <Link href={href(addMonths(month, 1))} className="btn-outline py-1 px-2"><ChevronRight size={16} /></Link>
        <span className="font-display font-bold text-lg ml-2">{TH_MONTHS[m - 1]} {y + 543}</span>
      </div>
      <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
        <MonthCalendar month={month} today={today} events={events} categories={(cats ?? []) as EventCategory[]} meId={session.appUser.id} isAdmin={session.isAdmin} />
        <div className="card p-4">
          <h2 className="font-display font-bold mb-2">30 วันข้างหน้า</h2>
          <ul className="space-y-1.5 text-sm">
            {upcoming.map((o) => <li key={o.ev.id + o.start} className="flex gap-2"><span className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: o.ev.event_categories?.color ?? "#6b7280" }} /><div><div className="font-medium leading-tight">{o.ev.title}</div><div className="text-[11px] text-ink-soft">{fmtDM(o.start)}{o.end !== o.start ? ` – ${fmtDM(o.end)}` : ""}{o.ev.start_time ? ` · ${o.ev.start_time.slice(0, 5)}` : ""}{o.ev.location ? ` · ${o.ev.location}` : ""}</div></div></li>)}
            {!upcoming.length && <li className="text-ink-soft text-xs">ยังไม่มีกิจกรรม</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
