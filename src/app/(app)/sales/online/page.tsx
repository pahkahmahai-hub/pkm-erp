import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, todayBkk, monthRange } from "@/lib/format";
import { toggleChannelTks, saveChannel, deleteChannel } from "../actions";
import { OnlineDayEditor } from "@/components/sales/OnlineDayEditor";
import type { OnlineChannel, OnlineDaily, OnlineItem } from "@/lib/sales/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function OnlinePage({ searchParams }: { searchParams: Promise<{ date?: string; saved?: string; error?: string; open?: string; deleted?: string; note?: string; manage?: string }> }) {
  const { date = todayBkk(), saved, error, open, deleted, note, manage } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const ym = date.slice(0, 7);
  const { from, to } = monthRange(ym);
  const [{ data: channels }, { data: day }, { data: month }, { data: dayItems }, { data: products }, { data: monthItems }] = await Promise.all([
    supabase.from("online_channels").select("*").order("sort_order"),
    supabase.from("online_sales_daily").select("*").eq("sale_date", date),
    supabase.from("online_sales_daily").select("*").gte("sale_date", from).lte("sale_date", to),
    supabase.from("online_sales_items").select("*").eq("sale_date", date).order("created_at"),
    supabase.from("products").select("id, code, name, barcode, price, unit").eq("is_active", true).order("name"),
    supabase.from("online_sales_items").select("channel, sale_date, qty, amount").gte("sale_date", from).lte("sale_date", to),
  ]);
  const mi = (monthItems ?? []) as { channel: string; sale_date: string; qty: number; amount: number }[];
  const qtyByCh = mi.reduce<Record<string, number>>((a, r) => { a[r.channel] = (a[r.channel] ?? 0) + Number(r.qty); return a; }, {});
  // per channel: list of recorded days this month (for edit / delete)
  const history: Record<string, { date: string; lines: number; qty: number; gross: number; payout: number; orders: number; fees: number; tks: boolean }[]> = {};
  for (const d of (month ?? []) as OnlineDaily[]) {
    const its = mi.filter((x) => x.channel === d.channel && x.sale_date === d.sale_date);
    (history[d.channel] ??= []).push({ date: d.sale_date, lines: its.length, qty: its.reduce((a, x) => a + Number(x.qty), 0), gross: Number(d.gross_amount), payout: Number(d.payout_amount ?? 0), orders: d.orders_count, fees: Number(d.fees), tks: d.recorded_tks });
  }
  for (const k of Object.keys(history)) history[k].sort((a, b) => b.date.localeCompare(a.date));
  const allCh = (channels ?? []) as OnlineChannel[];
  const ch = allCh.filter((c) => c.is_active);
  const byCh = Object.fromEntries(((day ?? []) as OnlineDaily[]).map((d) => [d.channel, d]));
  const m = (month ?? []) as OnlineDaily[];
  const mByCh = Object.fromEntries(ch.map((c) => [c.key, m.filter((x) => x.channel === c.key).reduce((a, x) => ({ orders: a.orders + x.orders_count, gross: a.gross + Number(x.gross_amount), net: a.net + Number(x.net_amount), tks: a.tks + (x.recorded_tks ? Number(x.gross_amount) : 0), payout: a.payout + Number(x.payout_amount ?? 0) }), { orders: 0, gross: 0, net: 0, tks: 0, payout: 0 })]));
  const mTotal = Object.values(mByCh).reduce((a, x) => ({ orders: a.orders + x.orders, gross: a.gross + x.gross, net: a.net + x.net, tks: a.tks + x.tks, payout: a.payout + x.payout }), { orders: 0, gross: 0, net: 0, tks: 0, payout: 0 });
  const prev = new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10);
  const next = new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10);
  const dayTotal = Object.values(byCh).reduce((a, d) => a + Number(d.gross_amount), 0);

  return (
    <div className="space-y-6">
      <Header title="ยอดขายออนไลน์รายวัน" sub={`${fmtDate(date, { weekday: "long" })} · รวม ฿${fmt(dayTotal)}`} action={session.isAdmin ? <Link href={`/sales/online?date=${date}${manage ? "" : "&manage=1"}`} className="btn-outline">{manage ? "ปิดการจัดการแพลตฟอร์ม" : "จัดการแพลตฟอร์ม"}</Link> : undefined} />
      
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <form className="flex items-center gap-2">
        <Link href={`/sales/online?date=${prev}`} className="btn-outline py-1.5 px-3">‹</Link>
        <input type="date" name="date" defaultValue={date} max={todayBkk()} className="input w-44" />
        <button className="btn-outline py-1.5 px-3">ไป</button>
        {next <= todayBkk() && <Link href={`/sales/online?date=${next}`} className="btn-outline py-1.5 px-3">›</Link>}
        <Link href="/sales/online" className="btn-ghost py-1.5 px-3 text-xs">วันนี้</Link>
      </form>

      {saved && saved !== "1" && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึก {ch.find((c) => c.key === saved)?.name ?? saved} แล้ว</div>}
      {note && <div className="rounded-xl bg-yellow/15 text-[#8a6a00] text-sm px-4 py-3">{note}</div>}
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบรายการวันที่ {fmtDate(deleted)} แล้ว</div>}
      <OnlineDayEditor date={date} channels={ch} products={products ?? []} items={(dayItems ?? []) as OnlineItem[]} daily={(day ?? []) as OnlineDaily[]} openKey={open ?? (saved && saved !== "1" ? saved : undefined)} history={history} />
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

      {session.isAdmin && manage && (
        <section className="card p-5 space-y-3">
          <h2 className="font-display font-bold">จัดการแพลตฟอร์ม <span className="text-xs text-ink-soft font-normal">(เฉพาะผู้บริหาร)</span></h2>
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th className="w-10">สี</th><th>ชื่อแพลตฟอร์ม</th><th className="w-20">ลำดับ</th><th className="w-36">ออกบิลในนาม</th><th className="w-24">สถานะ</th><th className="w-44" /></tr></thead>
            <tbody>
              {allCh.map((c) => (
                <tr key={c.key} className={c.is_active ? "" : "opacity-50"}><td colSpan={6} className="!p-0">
                  <div className="grid grid-cols-[40px_1fr_80px_144px_96px_176px] items-center gap-2 px-3 py-2">
                    <form action={saveChannel} className="contents">
                      <input type="hidden" name="key" value={c.key} />
                      <input type="color" name="color" defaultValue={c.color} className="h-8 w-8 rounded border border-line bg-transparent" />
                      <input name="name" defaultValue={c.name} className="input !py-1" />
                      <input name="sort_order" type="number" defaultValue={c.sort_order} className="input !py-1 text-right" />
                      <select name="bills_to_tks" defaultValue={c.bills_to_tks ? "on" : "off"} className="input !py-1 text-xs"><option value="off">ปากาม้า</option><option value="on">ทีฆาซอร์ส (TKS)</option></select>
                      <select name="is_active" defaultValue={c.is_active ? "on" : "off"} className="input !py-1 text-xs"><option value="on">ใช้งาน</option><option value="off">ปิด</option></select>
                      <div className="flex gap-1 justify-end"><button className="btn-ghost !py-1 !px-2 text-xs">บันทึก</button></div>
                    </form>
                  </div>
                  <div className="px-3 pb-2 -mt-1 flex justify-end"><form action={deleteChannel.bind(null, c.key)}><button className="text-[11px] text-red underline">ลบ {c.name}</button></form></div>
                </td></tr>
              ))}
              <tr><td colSpan={6} className="!p-0 bg-cream/50">
                <form action={saveChannel} className="grid grid-cols-[40px_1fr_80px_144px_96px_176px] items-center gap-2 px-3 py-2">
                  <input type="color" name="color" defaultValue="#452a79" className="h-8 w-8 rounded border border-line bg-transparent" />
                  <input name="name" placeholder="ชื่อแพลตฟอร์มใหม่ เช่น LINE Shopping" className="input !py-1" required />
                  <input name="sort_order" type="number" defaultValue={allCh.length + 1} className="input !py-1 text-right" />
                  <select name="bills_to_tks" defaultValue="off" className="input !py-1 text-xs"><option value="off">ปากาม้า</option><option value="on">ทีฆาซอร์ส (TKS)</option></select>
                  <span className="text-xs text-ink-soft">ใช้งาน</span>
                  <div className="flex justify-end"><button className="btn-primary !py-1 !px-3 text-xs">+ เพิ่มแพลตฟอร์ม</button></div>
                </form>
              </td></tr>
            </tbody></table></div>
          <p className="text-xs text-ink-soft">ลบได้เฉพาะแพลตฟอร์มที่ยังไม่มียอดขายบันทึก — ถ้ามีข้อมูลแล้วระบบจะ “ปิดใช้งาน” แทน (ข้อมูลเก่ายังอยู่ครบ เปิดกลับได้)</p>
        </section>
      )}
    </div>
  );
}
