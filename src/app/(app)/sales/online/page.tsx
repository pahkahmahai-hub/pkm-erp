import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, todayBkk, monthRange } from "@/lib/format";
import { saveOnlineDay, toggleChannelTks } from "../actions";
import type { OnlineChannel, OnlineDaily } from "@/lib/sales/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function OnlinePage({ searchParams }: { searchParams: Promise<{ date?: string; saved?: string; error?: string }> }) {
  const { date = todayBkk(), saved, error } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const ym = date.slice(0, 7);
  const { from, to } = monthRange(ym);
  const [{ data: channels }, { data: day }, { data: month }] = await Promise.all([
    supabase.from("online_channels").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("online_sales_daily").select("*").eq("sale_date", date),
    supabase.from("online_sales_daily").select("*").gte("sale_date", from).lte("sale_date", to),
  ]);
  const ch = (channels ?? []) as OnlineChannel[];
  const byCh = Object.fromEntries(((day ?? []) as OnlineDaily[]).map((d) => [d.channel, d]));
  const m = (month ?? []) as OnlineDaily[];
  const mByCh = Object.fromEntries(ch.map((c) => [c.key, m.filter((x) => x.channel === c.key).reduce((a, x) => ({ orders: a.orders + x.orders_count, gross: a.gross + Number(x.gross_amount), net: a.net + Number(x.net_amount), tks: a.tks + (x.recorded_tks ? Number(x.net_amount) : 0) }), { orders: 0, gross: 0, net: 0, tks: 0 })]));
  const mTotal = Object.values(mByCh).reduce((a, x) => ({ orders: a.orders + x.orders, gross: a.gross + x.gross, net: a.net + x.net, tks: a.tks + x.tks }), { orders: 0, gross: 0, net: 0, tks: 0 });
  const prev = new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10);
  const next = new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10);
  const dayTotal = Object.values(byCh).reduce((a, d) => a + Number(d.gross_amount), 0);

  return (
    <div className="space-y-6">
      <Header title="ยอดขายออนไลน์รายวัน" sub={`${fmtDate(date, { weekday: "long" })} · รวม ฿${fmt(dayTotal)}`} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <form className="flex items-center gap-2">
        <Link href={`/sales/online?date=${prev}`} className="btn-outline py-1.5 px-3">‹</Link>
        <input type="date" name="date" defaultValue={date} max={todayBkk()} className="input w-44" />
        <button className="btn-outline py-1.5 px-3">ไป</button>
        {next <= todayBkk() && <Link href={`/sales/online?date=${next}`} className="btn-outline py-1.5 px-3">›</Link>}
        <Link href="/sales/online" className="btn-ghost py-1.5 px-3 text-xs">วันนี้</Link>
      </form>

      <form action={saveOnlineDay} className="card overflow-x-auto">
        <input type="hidden" name="sale_date" value={date} />
        <table className="tbl min-w-[820px]">
          <thead><tr><th>แพลตฟอร์ม</th><th className="w-28">ออเดอร์</th><th className="w-40">ยอดขายรวม (บาท)</th><th className="w-36">ค่าธรรมเนียม</th><th className="w-32 text-right">สุทธิ</th><th className="w-36">เข้าทีฆาซอร์ส</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {ch.map((c) => { const d = byCh[c.key]; return (
              <tr key={c.key}>
                <td><input type="hidden" name="channel" value={c.key} /><span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: c.color }} /><b>{c.name}</b>{c.bills_to_tks && <span className="badge-ok ml-2">TKS</span>}</td>
                <td><input name={`orders_${c.key}`} type="number" min={0} defaultValue={d?.orders_count ?? ""} className="input" placeholder="0" /></td>
                <td><input name={`gross_${c.key}`} type="number" step="0.01" min={0} defaultValue={d?.gross_amount ?? ""} className="input text-right" placeholder="0.00" /></td>
                <td><input name={`fees_${c.key}`} type="number" step="0.01" min={0} defaultValue={d?.fees ?? ""} className="input text-right" placeholder="0.00" /></td>
                <td className="text-right font-semibold">{d ? fmt(d.net_amount) : "—"}</td>
                <td><label className="flex items-center gap-2 text-xs"><input type="checkbox" name={`tks_${c.key}`} defaultChecked={d?.recorded_tks ?? c.bills_to_tks} className="accent-purple" /> บันทึกเข้า TKS</label></td>
                <td><input name={`note_${c.key}`} defaultValue={d?.note ?? ""} className="input" /></td>
              </tr>
            ); })}
          </tbody>
        </table>
        <div className="p-4 flex items-center gap-3"><button className="btn-primary">บันทึกยอดวันนี้</button><span className="text-xs text-ink-soft">ติ๊ก "เข้า TKS" = ออเดอร์ของแพลตฟอร์มนี้ออกใบเสร็จในนามทีฆาซอร์สแล้ว (ใช้คำนวณใบเบิกซื้อสิ้นเดือน)</span></div>
      </form>

      <section className="card p-5">
        <h2 className="font-display font-bold mb-3">สรุปเดือน {fmtDate(from, { month: "long", year: "numeric", day: undefined })}</h2>
        <table className="tbl">
          <thead><tr><th>แพลตฟอร์ม</th><th className="text-right">ออเดอร์</th><th className="text-right">ยอดขาย</th><th className="text-right">สุทธิ</th><th className="text-right">ส่วนที่เข้า TKS</th>{session.isAdmin && <th>ออกใบเสร็จในนาม</th>}</tr></thead>
          <tbody>
            {ch.map((c) => <tr key={c.key}><td>{c.name}</td><td className="text-right">{mByCh[c.key].orders}</td><td className="text-right">{fmt(mByCh[c.key].gross)}</td><td className="text-right font-semibold">{fmt(mByCh[c.key].net)}</td><td className="text-right text-purple">{fmt(mByCh[c.key].tks)}</td>
              {session.isAdmin && <td><form action={toggleChannelTks.bind(null, c.key, !c.bills_to_tks)}><button className="text-xs underline text-purple">{c.bills_to_tks ? "ทีฆาซอร์ส → เปลี่ยนเป็นปากาม้า" : "ปากาม้า → เปลี่ยนเป็นทีฆาซอร์ส"}</button></form></td>}</tr>)}
            <tr className="font-bold"><td>รวม</td><td className="text-right">{mTotal.orders}</td><td className="text-right">{fmt(mTotal.gross)}</td><td className="text-right">{fmt(mTotal.net)}</td><td className="text-right text-purple">{fmt(mTotal.tks)}</td>{session.isAdmin && <td></td>}</tr>
          </tbody>
        </table>
        <p className="text-xs text-ink-soft mt-3">ปุ่ม "ปิดเดือน → ใบเบิกซื้อทีฆาซอร์ส + ใบส่งของปากาม้า" จะมาในรอบ 3 พร้อมอัปโหลดไฟล์รายงานแพลตฟอร์ม</p>
      </section>
    </div>
  );
}
