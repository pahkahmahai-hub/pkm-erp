import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, LayoutGrid, Table2, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { RoomTabs } from "@/components/work/RoomTabs";
import { loadRoomAccess, loadDirectory } from "@/lib/work/queries";
import { todayBkk } from "@/lib/today";
import { CORP_STATUS, CORP_PAY, corpStatus, corpPay, corpOpen, corpOverdue, corpName, baht, type CorpOrder } from "@/lib/work/corp";
import { Kpi, OrderCard } from "@/components/work/CorpBoard";

export const dynamic = "force-dynamic";

const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dm = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${TH_M[Number(d.slice(5, 7)) - 1]}` : "—");
const dmy = (d: string | null) => (d ? `${dm(d)} ${(Number(d.slice(0, 4)) + 543) % 100}` : "—");
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

export default async function CorporatePage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ view?: string; year?: string; q?: string; st?: string; pay?: string; deleted?: string }> }) {
  const { key } = await params;
  if (key !== "operation") notFound();
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  const today = todayBkk();
  const view = sp.view === "table" ? "table" : "board";
  const thisYear = today.slice(0, 4);

  const [{ data, error }, dir] = await Promise.all([
    supabase.from("corp_orders").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("order_no", { ascending: false }).limit(2000),
    loadDirectory(supabase),
  ]);
  const all = (data ?? []) as CorpOrder[];
  const nameOf = (id: string | null) => { const e = id ? dir.find((x) => x.id === id) : null; return e ? e.nickname ?? e.first_name : null; };
  const years = [...new Set(all.map((o) => o.order_date.slice(0, 4)))].sort().reverse();
  const year = sp.year === "all" ? "all" : sp.year && /^\d{4}$/.test(sp.year) ? sp.year : thisYear;
  const q = (sp.q ?? "").trim().toLowerCase();

  // KPIs
  const yearOrders = all.filter((o) => o.order_date.startsWith(thisYear) && o.status !== "cancelled");
  const open = all.filter(corpOpen);
  const dueSoon = open.filter((o) => o.due_date && o.due_date >= today && o.due_date <= addDays(today, 7));
  const overdue = open.filter((o) => corpOverdue(o, today));
  const unpaid = all.filter((o) => (o.status === "delivered" || o.status === "partial") && o.pay_status !== "paid");
  const noDeposit = open.filter((o) => o.pay_status === "none");
  const sum = (l: CorpOrder[]) => l.reduce((s, o) => s + Number(o.amount), 0);
  const top = Object.entries(yearOrders.reduce<Record<string, number>>((m, o) => ({ ...m, [o.customer_name]: (m[o.customer_name] ?? 0) + Number(o.amount) }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // filters (table)
  let list = all.filter((o) => (year === "all" || o.order_date.startsWith(year)));
  if (q) list = list.filter((o) => [o.order_no, o.customer_name, o.customer_label, o.title, o.detail, o.doc_qt, o.doc_iv, o.doc_bill].some((v) => (v ?? "").toLowerCase().includes(q)));
  if (sp.st === "open") list = list.filter(corpOpen); else if (sp.st && CORP_STATUS.some((s) => s.key === sp.st)) list = list.filter((o) => o.status === sp.st);
  if (sp.pay && CORP_PAY.some((s) => s.key === sp.pay)) list = list.filter((o) => o.pay_status === sp.pay);

  // board: open orders + delivered in last 30 days or not yet paid
  const boardCols = CORP_STATUS.filter((s) => s.key !== "cancelled");
  const boardList = all.filter((o) => corpOpen(o) || (o.status === "delivered" && (o.pay_status !== "paid" || (o.delivered_at ?? "") >= addDays(today, -30))));
  const base = `/work/rooms/${key}/corporate`;
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries({ view, year, q: sp.q, st: sp.st, pay: sp.pay, ...patch }).filter(([, v]) => v) as [string, string][]); return `${base}?${p}`; };
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }];

  return (
    <div className="space-y-4">
      <Header crumbs={crumbs} title="ออเดอร์ลูกค้า Corporate" sub="บันทึกลูกค้า รายละเอียดออเดอร์ กำหนดส่ง สถานะงาน สถานะเงิน และเอกสาร — มูลค่าเป็นยอดรวม VAT" action={<Link href={`${base}/new`} className="btn-primary"><Plus size={16} /> ออเดอร์ใหม่</Link>} />
      <RoomTabs roomKey={key} tab="corporate" />
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบออเดอร์แล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">ยังไม่ได้รัน SQL 0034 — {error.message}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label={`ยอดออเดอร์ปี ${Number(thisYear) + 543}`} value={`฿${baht(sum(yearOrders))}`} sub={`${yearOrders.length} ออเดอร์`} />
        <Kpi label="กำลังทำ" value={`${open.length}`} sub={`฿${baht(sum(open))}`} href={qs({ view: "table", st: "open", year: "all", pay: undefined })} />
        <Kpi label="ครบกำหนดส่งใน 7 วัน" value={`${dueSoon.length}`} sub={dueSoon.slice(0, 2).map((o) => corpName(o)).join(", ") || "—"} tone={dueSoon.length ? "yellow" : undefined} />
        <Kpi label="เลยกำหนดส่ง" value={`${overdue.length}`} sub={overdue.slice(0, 2).map((o) => corpName(o)).join(", ") || "—"} tone={overdue.length ? "red" : undefined} />
        <Kpi label="ยังไม่มัดจำ (กำลังทำ)" value={`${noDeposit.length}`} sub={`฿${baht(sum(noDeposit))}`} href={qs({ view: "table", st: "open", pay: "none", year: "all" })} />
        <Kpi label="ส่งแล้ว ยังไม่ได้เงินครบ" value={`฿${baht(sum(unpaid))}`} sub={`${unpaid.length} ออเดอร์`} tone={unpaid.length ? "coral" : undefined} href={qs({ view: "table", st: undefined, pay: "awaiting", year: "all" })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-xl border border-line p-0.5">
          <Link href={qs({ view: "board" })} className={`rounded-lg px-3 py-1 text-xs font-semibold flex items-center gap-1 ${view === "board" ? "bg-purple text-white" : "text-ink-soft hover:bg-cream"}`}><LayoutGrid size={13} /> บอร์ด</Link>
          <Link href={qs({ view: "table" })} className={`rounded-lg px-3 py-1 text-xs font-semibold flex items-center gap-1 ${view === "table" ? "bg-purple text-white" : "text-ink-soft hover:bg-cream"}`}><Table2 size={13} /> ตาราง</Link>
        </span>
        {view === "table" && (
          <form className="flex flex-wrap gap-2 items-center text-sm">
            <input type="hidden" name="view" value="table" />
            <select name="year" defaultValue={year} className="input py-1 w-auto"><option value="all">ทุกปี</option>{years.map((y) => <option key={y} value={y}>ปี {Number(y) + 543}</option>)}</select>
            <select name="st" defaultValue={sp.st ?? ""} className="input py-1 w-auto"><option value="">ทุกสถานะงาน</option><option value="open">กำลังทำ (ยังไม่ส่งครบ)</option>{CORP_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            <select name="pay" defaultValue={sp.pay ?? ""} className="input py-1 w-auto"><option value="">ทุกสถานะเงิน</option>{CORP_PAY.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            <input name="q" defaultValue={sp.q ?? ""} className="input py-1 w-48" placeholder="ค้นหา ลูกค้า/สินค้า/เลขเอกสาร" />
            <button className="btn-outline py-1 px-3 text-xs">กรอง</button>
          </form>
        )}
      </div>

      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {boardCols.map((c) => {
            const l = boardList.filter((o) => o.status === c.key);
            return (
              <div key={c.key} className="w-[230px] shrink-0 rounded-2xl border border-line bg-white/60 p-3">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-sm font-semibold flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.fg }} />{c.label}{c.key === "delivered" && <span className="text-[10px] text-ink-soft font-normal">(30 วัน / ยังไม่ได้เงิน)</span>}</span>
                  <span className="text-xs text-ink-soft">{l.length}</span>
                </div>
                <div className="text-[10px] text-ink-soft px-1 -mt-1 mb-2">฿{baht(sum(l))}</div>
                <div className="space-y-1.5">{l.map((o) => <OrderCard key={o.id} o={o} today={today} href={`${base}/${o.id}`} owner={nameOf(o.owner_id)} />)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl text-sm">
            <thead><tr><th>เลข</th><th>ลูกค้า</th><th>รายการ</th><th className="text-right">มูลค่า (รวม VAT)</th><th>สั่ง</th><th>กำหนดส่ง</th><th>สถานะงาน</th><th>สถานะเงิน</th><th>เอกสาร</th></tr></thead>
            <tbody>
              {list.map((o) => {
                const st = corpStatus(o.status); const late = corpOverdue(o, today);
                return (
                  <tr key={o.id}>
                    <td className="font-mono text-xs"><Link href={`${base}/${o.id}`} className="text-purple font-semibold hover:underline">{o.order_no}</Link></td>
                    <td className="max-w-[180px]"><div className="font-medium truncate">{corpName(o)}</div></td>
                    <td className="max-w-[280px]"><Link href={`${base}/${o.id}`} className="hover:underline line-clamp-2">{o.title}</Link></td>
                    <td className="text-right whitespace-nowrap">{baht(o.amount)}</td>
                    <td className="whitespace-nowrap text-xs">{TH_M[Number(o.order_date.slice(5, 7)) - 1]} {(Number(o.order_date.slice(0, 4)) + 543) % 100}</td>
                    <td className={`whitespace-nowrap text-xs ${late ? "text-red font-semibold" : ""}`}>{late && <AlertTriangle size={11} className="inline mr-0.5" />}{dmy(o.due_date)}</td>
                    <td><span className="rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ background: st.bg, color: st.fg }}>{st.label}</span></td>
                    <td><span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${corpPay(o.pay_status).cls}`}>{corpPay(o.pay_status).label}</span></td>
                    <td className="text-[11px] text-ink-soft max-w-[160px]">{[o.doc_qt, o.doc_bill, o.doc_iv, o.doc_dr, o.doc_cn].filter(Boolean).join(", ") || "—"}{o.docs_original_sent && <span className="block text-green">✓ ส่งตัวจริงแล้ว</span>}</td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={9} className="text-center text-ink-soft py-6">ไม่มีออเดอร์ตามเงื่อนไข</td></tr>}
            </tbody>
            {list.length > 0 && <tfoot><tr className="font-bold"><td colSpan={3} className="text-right">รวม {list.length} ออเดอร์</td><td className="text-right">{baht(sum(list))}</td><td colSpan={5} /></tr></tfoot>}
          </table>
        </div>
      )}

      {top.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display font-bold mb-3">🏆 ลูกค้ายอดสูงสุด ปี {Number(thisYear) + 543}</h3>
          <div className="space-y-2">
            {top.map(([name, amt], i) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-ink-soft">{i + 1}</span>
                <span className="w-56 truncate font-medium">{name}</span>
                <span className="flex-1 h-2.5 rounded-full bg-cream overflow-hidden"><span className="block h-full bg-purple rounded-full" style={{ width: `${Math.max(4, (amt / top[0][1]) * 100)}%` }} /></span>
                <span className="w-28 text-right">฿{baht(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
