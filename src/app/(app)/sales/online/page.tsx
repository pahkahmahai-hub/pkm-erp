import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, todayBkk, monthRange } from "@/lib/format";
import { toggleChannelTks } from "../actions";
import { OnlineDayEditor } from "@/components/sales/OnlineDayEditor";
import type { OnlineChannel, OnlineDaily, OnlineItem } from "@/lib/sales/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function OnlinePage({ searchParams }: { searchParams: Promise<{ date?: string; saved?: string; error?: string }> }) {
  const { date = todayBkk(), saved, error } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const ym = date.slice(0, 7);
  const { from, to } = monthRange(ym);
  const [{ data: channels }, { data: day }, { data: month }, { data: dayItems }, { data: products }, { data: monthItems }] = await Promise.all([
    supabase.from("online_channels").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("online_sales_daily").select("*").eq("sale_date", date),
    supabase.from("online_sales_daily").select("*").gte("sale_date", from).lte("sale_date", to),
    supabase.from("online_sales_items").select("*").eq("sale_date", date).order("created_at"),
    supabase.from("products").select("id, code, name, barcode, price, unit").eq("is_active", true).order("name"),
    supabase.from("online_sales_items").select("channel, qty").gte("sale_date", from).lte("sale_date", to),
  ]);
  const qtyByCh = ((monthItems ?? []) as { channel: string; qty: number }[]).reduce<Record<string, number>>((a, r) => { a[r.channel] = (a[r.channel] ?? 0) + Number(r.qty); return a; }, {});
  const ch = (channels ?? []) as OnlineChannel[];
  const byCh = Object.fromEntries(((day ?? []) as OnlineDaily[]).map((d) => [d.channel, d]));
  const m = (month ?? []) as OnlineDaily[];
  const mByCh = Object.fromEntries(ch.map((c) => [c.key, m.filter((x) => x.channel === c.key).reduce((a, x) => ({ orders: a.orders + x.orders_count, gross: a.gross + Number(x.gross_amount), net: a.net + Number(x.net_amount), tks: a.tks + (x.recorded_tks ? Number(x.gross_amount) : 0), payout: a.payout + Number(x.payout_amount ?? 0) }), { orders: 0, gross: 0, net: 0, tks: 0, payout: 0 })]));
  const mTotal = Object.values(mByCh).reduce((a, x) => ({ orders: a.orders + x.orders, gross: a.gross + x.gross, net: a.net + x.net, tks: a.tks + x.tks, payout: a.payout + x.payout }), { orders: 0, gross: 0, net: 0, tks: 0, payout: 0 });
  const prev = new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10);
  const next = new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10);
  const dayTotal = Object.values(byCh).reduce((a, d) => a + Number(d.gross_amount), 0);

  return (
    <div className="space-y-6">
      <Header title="ยอดขายออนไลน์รายวัน" sub={`${fmtDate(date, { weekday: "long" })} · รวม ฿${fmt(dayTotal)}`} />
      
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <form className="flex items-center gap-2">
        <Link href={`/sales/online?date=${prev}`} className="btn-outline py-1.5 px-3">‹</Link>
        <input type="date" name="date" defaultValue={date} max={todayBkk()} className="input w-44" />
        <button className="btn-outline py-1.5 px-3">ไป</button>
        {next <= todayBkk() && <Link href={`/sales/online?date=${next}`} className="btn-outline py-1.5 px-3">›</Link>}
        <Link href="/sales/online" className="btn-ghost py-1.5 px-3 text-xs">วันนี้</Link>
      </form>

      {saved && saved !== "1" && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึก {ch.find((c) => c.key === saved)?.name ?? saved} แล้ว</div>}
      <OnlineDayEditor date={date} channels={ch} products={products ?? []} items={(dayItems ?? []) as OnlineItem[]} daily={(day ?? []) as OnlineDaily[]} openKey={saved && saved !== "1" ? saved : undefined} />
      <p className="text-xs text-ink-soft">บันทึกเป็นรายการสินค้าต่อแพลตฟอร์มต่อวัน — ระบบรวมยอดให้ และใช้ยอดนี้สร้างใบเบิกซื้อทีฆาซอร์สตอนปิดเดือน (เฉพาะแพลตฟอร์มที่ตั้งว่า “ออกบิลในนาม TKS”)</p>

      <section className="card p-5">
        <h2 className="font-display font-bold mb-3">สรุปเดือน {fmtDate(from, { month: "long", year: "numeric", day: undefined })}</h2>
        <table className="tbl">
          <thead><tr><th>แพลตฟอร์ม</th><th className="text-right">ออเดอร์</th><th className="text-right">ชิ้น</th><th className="text-right">ยอดขาย</th><th className="text-right">สุทธิหลังค่าธรรมเนียม</th><th className="text-right">เงินที่ได้รับจริง</th><th className="text-right">ส่วนที่เข้า TKS</th>{session.isAdmin && <th>ออกใบเสร็จในนาม</th>}</tr></thead>
          <tbody>
            {ch.map((c) => <tr key={c.key}><td>{c.name}</td><td className="text-right">{mByCh[c.key].orders}</td><td className="text-right">{qtyByCh[c.key] ?? 0}</td><td className="text-right">{fmt(mByCh[c.key].gross)}</td><td className="text-right font-semibold">{fmt(mByCh[c.key].net)}</td><td className="text-right text-green">{fmt(mByCh[c.key].payout)}</td><td className="text-right text-purple">{fmt(mByCh[c.key].tks)}</td>
              {session.isAdmin && <td><form action={toggleChannelTks.bind(null, c.key, !c.bills_to_tks)}><button className="text-xs underline text-purple">{c.bills_to_tks ? "ทีฆาซอร์ส → เปลี่ยนเป็นปากาม้า" : "ปากาม้า → เปลี่ยนเป็นทีฆาซอร์ส"}</button></form></td>}</tr>)}
            <tr className="font-bold"><td>รวม</td><td className="text-right">{mTotal.orders}</td><td className="text-right">{Object.values(qtyByCh).reduce((a, b) => a + b, 0)}</td><td className="text-right">{fmt(mTotal.gross)}</td><td className="text-right">{fmt(mTotal.net)}</td><td className="text-right text-green">{fmt(mTotal.payout)}</td><td className="text-right text-purple">{fmt(mTotal.tks)}</td>{session.isAdmin && <td></td>}</tr>
          </tbody>
        </table>
        <div className="mt-3"><Link href={`/sales/month-close?month=${ym}`} className="btn-outline">ปิดเดือน → สร้างใบเบิกซื้อทีฆาซอร์ส</Link></div>
      </section>
    </div>
  );
}
