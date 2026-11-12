import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, Trash2, Pencil, X } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import type { CompanyEvent } from "@/lib/work/types";
import { fmtDate } from "@/lib/format";
import { todayBkk } from "@/lib/today";
import { saveHoliday, deleteHoliday } from "../actions";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: "/work/company-calendar", label: "ปฏิทินบริษัท" }];

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string; edit?: string; saved?: string; deleted?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session.isAdmin) redirect("/work/company-calendar");
  const supabase = await createClient();
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : todayBkk().slice(0, 4);
  const { data: cat } = await supabase.from("event_categories").select("id").eq("key", "holiday").maybeSingle();
  const { data: rows } = cat ? await supabase.from("company_events").select("*").eq("category_id", cat.id).gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`).order("start_date") : { data: [] };
  const list = (rows ?? []) as CompanyEvent[];
  const e = sp.edit ? list.find((h) => h.id === sp.edit) ?? null : null;
  const y = Number(year);
  const days = list.reduce((a, h) => a + (Math.round((Date.parse(h.end_date) - Date.parse(h.start_date)) / 86400000) + 1), 0);

  return (
    <div className="space-y-4">
      <Header crumbs={WORK} title={`วันหยุดประจำปี ${y + 543}`} sub="ผู้บริหารตั้งวันหยุดบริษัท — แสดงในปฏิทินบริษัทเป็นแถบสีเทาและช่องวันที่แรเงา" action={<Link href={`/work/company-calendar?month=${year}-01`} className="btn-outline"><CalendarRange size={16} /> ดูในปฏิทิน</Link>} />
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบแล้ว</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[y - 1, y, y + 1, y + 2].map((yy) => <Link key={yy} href={`/work/holidays?year=${yy}`} className={yy === y ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"}>ปี {yy + 543}</Link>)}
        <span className="text-ink-soft text-xs ml-2">{list.length} รายการ · รวม {days} วัน</span>
      </div>

      <form action={saveHoliday} className="card p-5 grid md:grid-cols-5 gap-3 items-end">
        <input type="hidden" name="id" value={e?.id ?? ""} />
        <div className="md:col-span-2"><label className="label">{e ? "แก้ไขวันหยุด" : "เพิ่มวันหยุด"}</label><input name="title" defaultValue={e?.title ?? ""} className="input" required placeholder="เช่น วันสงกรานต์ / หยุดพิเศษบริษัท" /></div>
        <div><label className="label">วันที่</label><input type="date" name="start_date" defaultValue={e?.start_date ?? `${year}-01-01`} className="input" required /></div>
        <div><label className="label">ถึงวันที่ <span className="text-ink-soft font-normal">(ว่าง = วันเดียว)</span></label><input type="date" name="end_date" defaultValue={e && e.end_date !== e.start_date ? e.end_date : ""} className="input" /></div>
        <div className="flex gap-2"><button className="btn-primary">{e ? "บันทึก" : "เพิ่ม"}</button>{e && <Link href={`/work/holidays?year=${year}`} className="btn-outline"><X size={14} /></Link>}</div>
        <div className="md:col-span-5"><input name="note" defaultValue={e?.note ?? ""} className="input" placeholder="หมายเหตุ (ถ้ามี) เช่น หยุดเฉพาะสถาบันการเงิน / หยุดครึ่งวัน" /></div>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="w-44">วันที่</th><th className="w-16">วัน</th><th>วันหยุด</th><th>หมายเหตุ</th><th className="w-24" /></tr></thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id}>
                <td className="font-medium">{fmtDate(h.start_date)}{h.end_date !== h.start_date && ` – ${fmtDate(h.end_date)}`}</td>
                <td className="text-ink-soft text-xs">{fmtDate(h.start_date, { weekday: "short" }).split(" ")[0]}</td>
                <td>{h.title}</td><td className="text-xs text-ink-soft">{h.note ?? ""}</td>
                <td><div className="flex gap-1 justify-end"><Link href={`/work/holidays?year=${year}&edit=${h.id}`} className="btn-outline py-1 px-2 text-xs"><Pencil size={12} /></Link><form action={deleteHoliday.bind(null, h.id, year)}><button className="btn-outline py-1 px-2 text-xs !border-red !text-red"><Trash2 size={12} /></button></form></div></td>
              </tr>))}
            {!list.length && <tr><td colSpan={5} className="text-center text-ink-soft py-6">ยังไม่มีวันหยุดปีนี้ — เพิ่มด้านบน</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
