import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Truck, Trash2, History, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { loadRoomAccess, loadDirectory } from "@/lib/work/queries";
import { CorpOrderForm } from "@/components/work/CorpOrderForm";
import { CorpFiles } from "@/components/work/CorpFiles";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { todayBkk } from "@/lib/today";
import { fmtDateTime } from "@/lib/format";
import { CORP_STATUS, CORP_PAY, corpStatus, corpPay, corpOverdue, corpName, baht, type CorpOrder, type CorpShipment, type CorpFile, type CorpLog } from "@/lib/work/corp";
import { setCorpField, addCorpShipment, deleteCorpShipment, deleteCorpOrder } from "@/app/(app)/work/actions";

export const dynamic = "force-dynamic";
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dmy = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${TH_M[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(0, 4)) + 543}` : "—");

export default async function CorpOrderPage({ params, searchParams }: { params: Promise<{ key: string; id: string }>; searchParams: Promise<{ edit?: string; error?: string; saved?: string; created?: string }> }) {
  const { key, id } = await params;
  if (key !== "operation") notFound();
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  const [{ data: o }, { data: ships }, { data: files }, { data: logs }, dir, { data: cust }] = await Promise.all([
    supabase.from("corp_orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("corp_order_shipments").select("*").eq("order_id", id).order("ship_date"),
    supabase.from("corp_order_files").select("*").eq("order_id", id).order("created_at"),
    supabase.from("corp_order_log").select("*, app_users(display_name, email)").eq("order_id", id).order("at", { ascending: false }).limit(100),
    loadDirectory(supabase),
    supabase.from("corp_orders").select("customer_name").limit(2000),
  ]);
  if (!o) notFound();
  const order = o as CorpOrder;
  const today = todayBkk();
  const base = `/work/rooms/${key}/corporate`;
  const canManage = session.isAdmin || acc.isLead;
  const st = corpStatus(order.status); const pay = corpPay(order.pay_status); const late = corpOverdue(order, today);
  const owner = order.owner_id ? dir.find((e) => e.id === order.owner_id) : null;
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }, { href: base, label: "Corporate" }];

  if (sp.edit) {
    const customers = [...new Set((cust ?? []).map((c) => c.customer_name as string))].sort((a, b) => a.localeCompare(b, "th"));
    return (
      <div className="space-y-4 max-w-4xl">
        <Header crumbs={[...crumbs, { href: `${base}/${id}`, label: order.order_no }]} title={`แก้ไข ${order.order_no}`} />
        {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
        <CorpOrderForm o={order} customers={customers} people={dir.map((e) => ({ id: e.id, name: e.nickname ?? e.first_name }))} today={today} cancelHref={`${base}/${id}`} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header crumbs={crumbs} title={`${order.order_no} · ${corpName(order)}`} sub={order.title}
        action={<span className="flex gap-2"><Link href={`${base}/${id}?edit=1`} className="btn-outline"><Pencil size={15} /> แก้ไข</Link>{canManage && <ConfirmDelete action={deleteCorpOrder.bind(null, id)} label="ลบออเดอร์" warning={`ลบ ${order.order_no} พร้อมไฟล์แนบและประวัติทั้งหมด — กู้คืนไม่ได้ (ถ้าลูกค้ายกเลิก แนะนำเปลี่ยนสถานะเป็น "ยกเลิก" แทน)`} />}</span>} />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {(sp.saved || sp.created) && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">{sp.created ? `สร้างออเดอร์ ${order.order_no} แล้ว — แนบไฟล์ได้ด้านล่าง` : "บันทึกแล้ว"}</div>}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-4">
          {/* status steppers */}
          <div className="card p-5 space-y-4">
            <div>
              <div className="text-xs text-ink-soft mb-1.5">สถานะงาน — กดเพื่อเปลี่ยน</div>
              <div className="flex flex-wrap gap-1.5">
                {CORP_STATUS.map((s) => (
                  <form key={s.key} action={setCorpField.bind(null, id, "status", s.key)}>
                    <button className={`rounded-full px-3 py-1 text-xs font-semibold border ${order.status === s.key ? "border-transparent shadow-sm" : "border-line bg-white text-ink-soft hover:bg-cream"}`} style={order.status === s.key ? { background: s.bg, color: s.fg } : undefined}>{s.label}</button>
                  </form>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-soft mb-1.5">สถานะเงิน</div>
              <div className="flex flex-wrap gap-1.5">
                {CORP_PAY.map((s) => (
                  <form key={s.key} action={setCorpField.bind(null, id, "pay_status", s.key)}>
                    <button className={`rounded-full px-3 py-1 text-xs font-semibold border ${order.pay_status === s.key ? `border-transparent ${s.cls}` : "border-line bg-white text-ink-soft hover:bg-cream"}`}>{s.label}</button>
                  </form>
                ))}
              </div>
            </div>
          </div>

          {/* details */}
          <div className="card p-5 space-y-3 text-sm">
            <dl className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Item label="มูลค่า (รวม VAT)"><b className="text-lg font-display">฿{baht(order.amount)}</b></Item>
              <Item label="กำหนดส่งลูกค้า"><b className={late ? "text-red" : ""}>{late && <AlertTriangle size={13} className="inline mr-1" />}{dmy(order.due_date)}{late && " (เลยกำหนด)"}</b></Item>
              <Item label="กำหนดรับของจากซัพ">{dmy(order.supplier_due)}</Item>
              <Item label="วันที่รับออเดอร์">{dmy(order.order_date)}</Item>
              <Item label="ลูกค้า">{corpName(order)}{order.customer_label && <div className="text-[11px] text-ink-soft">({order.customer_name})</div>}</Item>
              <Item label="ผู้ติดต่อ">{order.contact_person ?? "—"}{order.contact_phone && <div className="text-[11px] text-ink-soft">{order.contact_phone}</div>}</Item>
              <Item label="ผู้ดูแลออเดอร์">{owner ? owner.nickname ?? owner.first_name : "—"}</Item>
              <Item label="ส่งครบเมื่อ">{dmy(order.delivered_at)}</Item>
            </dl>
            {order.detail && <div><div className="text-xs text-ink-soft">รายละเอียดสินค้า / Packaging</div><p className="whitespace-pre-wrap">{order.detail}</p></div>}
            {order.note && <div className="rounded-xl bg-cream px-3 py-2 whitespace-pre-wrap"><b>หมายเหตุ:</b> {order.note}</div>}
          </div>

          <CorpFiles orderId={id} roomId={acc.room.id} files={(files ?? []) as CorpFile[]} meId={session.appUser.id} canManage={canManage} />
        </div>

        <div className="space-y-4">
          {/* documents */}
          <div className="card p-5 space-y-2 text-sm">
            <h3 className="font-display font-bold">เอกสาร</h3>
            {([["ใบเสนอราคา (QT)", order.doc_qt], ["ใบแจ้งหนี้", order.doc_bill], ["ใบกำกับภาษี (IV)", order.doc_iv], ["ใบเสร็จ (DR)", order.doc_dr], ["ใบส่งของชั่วคราว", order.doc_cn]] as const).map(([l, v]) => (
              <div key={l} className="flex justify-between gap-2"><span className="text-ink-soft">{l}</span><span className={`font-mono text-xs text-right ${v ? "" : "text-ink-soft/50"}`}>{v ?? "—"}</span></div>
            ))}
            <div className={`rounded-lg px-2 py-1 text-xs font-semibold ${order.docs_original_sent ? "bg-green/10 text-green" : "bg-cream text-ink-soft"}`}>{order.docs_original_sent ? "✓ ส่งเอกสารตัวจริงครบแล้ว" : "ยังไม่ได้ส่งเอกสารตัวจริง"}</div>
            <div className="flex gap-2 pt-1"><span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${pay.cls}`}>{pay.label}</span></div>
          </div>

          {/* shipments */}
          <div className="card p-5 space-y-3">
            <h3 className="font-display font-bold flex items-center gap-2"><Truck size={16} /> การส่งของ (แบ่งส่งได้)</h3>
            {(ships ?? []).length > 0 ? (
              <ul className="text-sm space-y-1">{((ships ?? []) as CorpShipment[]).map((s) => (
                <li key={s.id} className="flex items-start gap-2">
                  <span className="text-ink-soft w-20 shrink-0">{dmy(s.ship_date).replace(/ \d{4}$/, "")}</span>
                  <span className="flex-1"><b>{s.qty_note}</b>{s.note && <span className="text-ink-soft"> · {s.note}</span>}</span>
                  {(canManage || s.created_by === session.appUser.id) && <form action={deleteCorpShipment.bind(null, id, s.id)}><button className="text-ink-soft hover:text-red" aria-label="ลบ"><Trash2 size={13} /></button></form>}
                </li>))}</ul>
            ) : <p className="text-xs text-ink-soft">ยังไม่มีบันทึกการส่ง</p>}
            <form action={addCorpShipment.bind(null, id)} className="space-y-2 border-t border-line pt-3">
              <div className="grid grid-cols-2 gap-2"><input type="date" name="ship_date" defaultValue={today} className="input text-sm" required /><input name="qty_note" className="input text-sm" placeholder="จำนวน เช่น 100 ชิ้น" required /></div>
              <input name="note" className="input text-sm" placeholder="หมายเหตุ เช่น ส่งทาง iShip / ผู้รับ" />
              <div className="flex flex-wrap gap-3 text-xs"><label className="flex items-center gap-1"><input type="radio" name="mark" value="" defaultChecked className="accent-purple" /> ไม่เปลี่ยนสถานะ</label><label className="flex items-center gap-1"><input type="radio" name="mark" value="partial" className="accent-purple" /> → ส่งบางส่วน</label><label className="flex items-center gap-1"><input type="radio" name="mark" value="delivered" className="accent-purple" /> → ส่งครบแล้ว</label></div>
              <button className="btn-primary w-full text-sm">บันทึกการส่ง</button>
            </form>
          </div>

          {/* log */}
          <div className="card p-5">
            <h3 className="font-display font-bold flex items-center gap-2 mb-2"><History size={16} /> ประวัติ</h3>
            <ul className="text-xs space-y-1.5">{((logs ?? []) as CorpLog[]).map((l) => (
              <li key={l.id}><span className="text-ink-soft">{fmtDateTime(l.at)}{l.app_users ? ` · ${l.app_users.display_name ?? l.app_users.email.split("@")[0]}` : ""}</span><div>{l.message}</div></li>))}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-ink-soft">{label}</dt><dd className="font-medium">{children}</dd></div>;
}
