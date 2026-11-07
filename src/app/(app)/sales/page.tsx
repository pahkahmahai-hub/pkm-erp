import Link from "next/link";
import { Plus, FileText, Receipt, Globe, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header, Stat } from "@/components/ui";
import { fmtDate, todayBkk, monthRange } from "@/lib/format";
import { DOC_META, STATUS_TH, STATUS_BADGE, CHANNEL_TH, type SalesDoc, type SalesChannel, type SalesDocType } from "@/lib/sales/types";

export const dynamic = "force-dynamic";
const fmt0 = (n: number) => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 0 });

const RANGES = [["today", "วันนี้", 0], ["7d", "7 วัน", 6], ["month", "เดือนนี้", -1], ["30d", "30 วัน", 29]] as const;

export default async function SalesHome({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "month" } = await searchParams;
  const supabase = await createClient();
  const today = todayBkk();
  const r = RANGES.find((x) => x[0] === range) ?? RANGES[2];
  const from = r[2] < 0 ? monthRange(today.slice(0, 7)).from : new Date(new Date(today).getTime() - r[2] * 86400000).toISOString().slice(0, 10);

  const [{ data: sum }, { data: online }, { data: recent }, { data: recv }, { data: drafts }] = await Promise.all([
    supabase.rpc("sales_summary", { p_from: from, p_to: today }),
    supabase.from("online_sales_daily").select("channel, gross_amount, net_amount, orders_count, online_channels(name, color)").gte("sale_date", from).lte("sale_date", today),
    supabase.from("sales_docs").select("*, companies(code)").neq("status", "draft").order("created_at", { ascending: false }).limit(10),
    supabase.from("sales_receivables").select("outstanding, overdue"),
    supabase.from("sales_docs").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);
  type S = { channel: SalesChannel; company_code: string; docs: number; net: number; vat: number; total: number };
  const rows = (sum ?? []) as S[];
  const docTotal = rows.reduce((a, x) => a + Number(x.total), 0);
  const byChannel = (Object.keys(CHANNEL_TH) as SalesChannel[]).map((c) => ({ c, total: rows.filter((x) => x.channel === c).reduce((a, x) => a + Number(x.total), 0), docs: rows.filter((x) => x.channel === c).reduce((a, x) => a + x.docs, 0) })).filter((x) => x.docs > 0);
  type O = { channel: string; gross_amount: number; net_amount: number; orders_count: number; online_channels: { name: string; color: string } | null };
  const on = (online ?? []) as unknown as O[];
  const onlineTotal = on.reduce((a, x) => a + Number(x.gross_amount), 0);
  const onlineBy = Object.values(on.reduce<Record<string, { name: string; color: string; gross: number; orders: number }>>((acc, x) => { const k = x.channel; acc[k] = acc[k] ?? { name: x.online_channels?.name ?? k, color: x.online_channels?.color ?? "#999", gross: 0, orders: 0 }; acc[k].gross += Number(x.gross_amount); acc[k].orders += x.orders_count; return acc; }, {})).sort((a, b) => b.gross - a.gross);
  const outstanding = (recv ?? []).reduce((a, x) => a + Number(x.outstanding), 0);
  const overdue = (recv ?? []).filter((x) => x.overdue).reduce((a, x) => a + Number(x.outstanding), 0);

  return (
    <div className="space-y-6">
      <Header title="ขาย" sub={`${fmtDate(from)} – ${fmtDate(today)}`} action={
        <div className="flex gap-2 flex-wrap">
          <Link href="/sales/docs/new?type=quotation" className="btn-outline"><Plus size={16} /> ใบเสนอราคา</Link>
          <Link href="/sales/docs/new?type=invoice" className="btn-primary"><Plus size={16} /> ใบส่งของ/ใบกำกับ</Link>
        </div>
      } />
      <div className="flex gap-2 flex-wrap">{RANGES.map((x) => <Link key={x[0]} href={`/sales?range=${x[0]}`} className={x[0] === r[0] ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>{x[1]}</Link>)}</div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="ยอดขายตามเอกสาร (บาท)" value={fmt0(docTotal)} tone="purple" href="/sales/docs?type=invoice" />
        <Stat label="ยอดขายออนไลน์ (บาท)" value={fmt0(onlineTotal)} tone="teal" href="/sales/online" />
        <Stat label="ลูกหนี้คงค้าง (บาท)" value={fmt0(outstanding)} tone="yellow" href="/sales/receivables" />
        <Stat label="เลยกำหนดชำระ (บาท)" value={fmt0(overdue)} tone="coral" href="/sales/receivables" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {([["quotation", FileText], ["invoice", Receipt], ["receipt", Wallet], ["billing", FileText]] as [SalesDocType, typeof FileText][]).map(([t, Icon]) => (
          <Link key={t} href={`/sales/docs?type=${t}`} className="card p-4 flex items-center gap-3 hover:border-purple"><div className="h-10 w-10 rounded-xl text-white grid place-items-center" style={{ background: DOC_META[t].color }}><Icon size={18} /></div><div><div className="font-semibold text-sm">{DOC_META[t].th}</div><div className="text-xs text-ink-soft">{DOC_META[t].prefix}</div></div></Link>
        ))}
        <Link href="/sales/online" className="card p-4 flex items-center gap-3 hover:border-purple"><div className="h-10 w-10 rounded-xl bg-teal text-white grid place-items-center"><Globe size={18} /></div><div><div className="font-semibold text-sm">ยอดขายออนไลน์</div><div className="text-xs text-ink-soft">7 แพลตฟอร์ม รายวัน</div></div></Link>
        <Link href="/sales/docs?type=credit_note" className="card p-4 flex items-center gap-3 hover:border-purple"><div className="h-10 w-10 rounded-xl text-white grid place-items-center" style={{ background: DOC_META.credit_note.color }}><FileText size={18} /></div><div><div className="font-semibold text-sm">ใบลดหนี้ / เพิ่มหนี้</div><div className="text-xs text-ink-soft">CN · DN</div></div></Link>
        <Link href="/sales/docs?type=temp_delivery" className="card p-4 flex items-center gap-3 hover:border-purple"><div className="h-10 w-10 rounded-xl text-white grid place-items-center" style={{ background: DOC_META.temp_delivery.color }}><FileText size={18} /></div><div><div className="font-semibold text-sm">ใบส่งของชั่วคราว</div><div className="text-xs text-ink-soft">TD</div></div></Link>
        {(drafts?.length ?? 0) >= 0 && <Link href="/sales/docs?type=invoice&status=draft" className="card p-4 flex items-center gap-3 hover:border-purple"><div className="h-10 w-10 rounded-xl bg-lavender text-purple grid place-items-center"><Plus size={18} /></div><div><div className="font-semibold text-sm">ฉบับร่าง</div><div className="text-xs text-ink-soft">ยังไม่ได้ออก</div></div></Link>}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3">ตามช่องทาง (เอกสาร)</h2>
          <ul className="text-sm divide-y divide-line">{byChannel.map((x) => <li key={x.c} className="py-2 flex justify-between"><span>{CHANNEL_TH[x.c]} <span className="text-xs text-ink-soft">({x.docs})</span></span><b>฿{fmt0(x.total)}</b></li>)}{!byChannel.length && <li className="py-4 text-center text-ink-soft">ยังไม่มีเอกสารในช่วงนี้</li>}</ul>
        </section>
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3">ออนไลน์ตามแพลตฟอร์ม</h2>
          <ul className="text-sm divide-y divide-line">{onlineBy.map((x) => <li key={x.name} className="py-2 flex justify-between"><span><span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: x.color }} />{x.name} <span className="text-xs text-ink-soft">({x.orders} ออเดอร์)</span></span><b>฿{fmt0(x.gross)}</b></li>)}{!onlineBy.length && <li className="py-4 text-center text-ink-soft">ยังไม่มียอดออนไลน์</li>}</ul>
        </section>
        <section className="card p-5">
          <h2 className="font-display font-bold mb-3">เอกสารล่าสุด</h2>
          <ul className="text-sm divide-y divide-line">{((recent ?? []) as SalesDoc[]).map((d) => <li key={d.id} className="py-2 flex justify-between gap-2"><Link href={`/sales/docs/${d.id}`} className="min-w-0"><div className="font-mono text-xs text-purple">{d.doc_no}</div><div className="truncate">{d.customer_name}</div></Link><div className="text-right whitespace-nowrap"><div className="font-semibold">฿{fmt0(d.grand_total)}</div><span className={STATUS_BADGE[d.status]}>{STATUS_TH[d.status]}</span></div></li>)}</ul>
        </section>
      </div>
    </div>
  );
}
