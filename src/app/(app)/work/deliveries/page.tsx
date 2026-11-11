import Link from "next/link";
import { ChevronLeft, ChevronRight, Store } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { DeliveryBoard, type EmpLite, type SalesDocLite } from "@/components/work/DeliveryBoard";
import { addDays, addMonths, weekColumns, monthOf, type DeliveryStore, type StoreDelivery } from "@/lib/work/deliveries";
import { todayBkk } from "@/lib/today";
import { loadDirectory, fillEmployees } from "@/lib/work/queries";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ from?: string; months?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const today = todayBkk();
  const span = Math.min(Math.max(Number(sp.months ?? 3), 1), 6);
  const from = /^\d{4}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addMonths(monthOf(today), -1);
  const to = addMonths(from, span - 1);
  const weeks = weekColumns(from, to);
  const rangeStart = weeks[0]?.start ?? from + "-01";
  const rangeEnd = addDays(weeks[weeks.length - 1]?.start ?? rangeStart, 6);
  const team = session.employee?.teams?.abbrev;
  const canEdit = session.isAdmin || team === "SW";

  const [{ data: stores }, { data: rows }, emps, { data: docs }, { data: users }] = await Promise.all([
    supabase.from("delivery_stores").select("*").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("store_deliveries").select("*, employees(id, first_name, nickname)").gte("week_start", rangeStart).lte("week_start", rangeEnd),
    loadDirectory(supabase),
    supabase.from("sales_docs").select("id, doc_no, doc_type, customer_name, doc_date, status").in("doc_type", ["temp_delivery", "invoice", "billing"]).neq("status", "cancelled").gte("doc_date", addDays(today, -90)).order("doc_date", { ascending: false }).limit(400),
    supabase.from("app_users").select("id, display_name, email"),
  ]);
  const userNames = Object.fromEntries(((users ?? []) as { id: string; display_name: string | null; email: string }[]).map((u) => [u.id, u.display_name ?? u.email]));
  const href = (f: string) => `/work/deliveries?from=${f}&months=${span}`;

  return (
    <div className="space-y-4">
      <Header crumbs={[...WORK, { href: "/work/rooms/sw-room", label: "SW ROOM" }]} title="ตารางส่งสินค้าห้าง" sub="ทีม SW — แถวละห้าง · ช่องละสัปดาห์ · สีตามขั้นตอน 1 สั่งจัด → 7 สินค้าถึงแล้ว" action={<span className="flex gap-2"><Link href="/work/rooms/sw-room" className="btn-outline">SW ROOM</Link>{canEdit && <Link href="/work/deliveries/stores" className="btn-outline"><Store size={16} /> จัดการห้าง</Link>}</span>} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={href(addMonths(from, -1))} className="btn-outline py-1 px-2"><ChevronLeft size={16} /></Link>
        <Link href={href(addMonths(monthOf(today), -1))} className="btn-outline py-1 px-3 text-xs">เดือนนี้</Link>
        <Link href={href(addMonths(from, 1))} className="btn-outline py-1 px-2"><ChevronRight size={16} /></Link>
        <span className="text-ink-soft text-xs ml-2">แสดง</span>
        {[2, 3, 4, 6].map((n) => <Link key={n} href={`/work/deliveries?from=${from}&months=${n}`} className={n === span ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>{n} เดือน</Link>)}
        {!canEdit && <span className="ml-auto text-xs text-ink-soft">ดูได้อย่างเดียว (แก้ไขโดยทีม SW และผู้บริหาร)</span>}
      </div>
      <DeliveryBoard stores={(stores ?? []) as DeliveryStore[]} deliveries={fillEmployees(rows as StoreDelivery[], emps, "assignee_id")} weeks={weeks} employees={emps as EmpLite[]} salesDocs={(docs ?? []) as SalesDocLite[]} canEdit={canEdit} today={today} userNames={userNames} />
    </div>
  );
}
