import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer, PackageCheck, Scissors, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { MO_STATUS_TH, MO_STATUS_BADGE, KIND_TH, type ProductionOrder, type ProductionOrderItem, type ProductionIssue, type ProductionReceipt, type Requirement } from "@/lib/production/types";
import { issueMaterials, receiveProduction, expenseFromProduction, cancelProductionOrder } from "../../actions";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const fmt = (n: number, d = 2) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

export default async function MoDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params; const flash = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: o }, { data: items }, { data: req }, { data: issues }, { data: receipts }] = await Promise.all([
    supabase.from("production_orders").select("*, companies(code, name_th), creator:app_users!production_orders_created_by_fkey(email), expenses(exp_no, status)").eq("id", id).maybeSingle(),
    supabase.from("production_order_items").select("*, products(code, name, barcode, unit)").eq("order_id", id).order("line_no"),
    supabase.rpc("mo_requirements", { p_order: id }),
    supabase.from("production_issues").select("*, production_issue_items(id, material_id, qty, unit_cost, materials(name, unit, kind))").eq("order_id", id).order("issued_at"),
    supabase.from("production_receipts").select("*").eq("order_id", id).order("received_at"),
  ]);
  if (!o) notFound();
  const d = o as ProductionOrder & { companies: { code: string; name_th: string }; creator: { email: string } | null; expenses: { exp_no: string; status: string } | null };
  const its = (items ?? []) as ProductionOrderItem[];
  const reqs = ((req?.lines ?? []) as Requirement[]);
  const noBom = (req?.no_bom ?? []) as { product_id: string; name: string }[];
  const open = !["completed", "cancelled"].includes(d.status);
  const remainingPieces = its.reduce((a, i) => a + Math.max(0, i.qty_ordered - i.qty_received - i.qty_defect), 0);
  const today = todayBkk();
  const admin = session.isAdmin;
  const mine = d.created_by === session.appUser.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-3"><h1 className="font-display text-2xl font-bold">{d.doc_no}</h1><span className={`${MO_STATUS_BADGE[d.status]} text-sm`}>{MO_STATUS_TH[d.status]}</span></div>
          <div className="text-sm text-ink-soft mt-1">ใบสั่งผลิต · {d.factory_name ?? "—"} · สั่ง {fmtDate(d.doc_date)}{d.due_date && ` · กำหนดส่ง ${fmtDate(d.due_date)}`} · โดย {d.creator?.email ?? "—"} {fmtDateTime(d.created_at)}</div></div>
        <div className="flex gap-2">{d.status === "draft" && (admin || mine) && <Link href={`/production/orders/${id}/edit`} className="btn-outline"><Pencil size={16} /> แก้ไข</Link>}<a href={`/print/production/${id}`} target="_blank" className="btn-outline"><Printer size={16} /> พิมพ์ใบสั่งผลิต</a></div>
      </div>
      {flash.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{flash.error}</div>}
      {flash.created && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">สร้างใบสั่งผลิตแล้ว — ตรวจวัสดุที่ต้องเบิกด้านล่าง แล้วกด “เบิกวัสดุ”</div>}
      {flash.issued && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">เบิกวัสดุแล้ว ใบเบิก <b>{flash.issued}</b> — ตัดสต็อกวัสดุเรียบร้อย</div>}
      {flash.received && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">รับสินค้าเข้าคลังแล้ว{flash.received !== "ok" && <> — ใบรับเข้า <b>{flash.received}</b></>}</div>}
      {noBom.length > 0 && <div className="rounded-xl bg-yellow/15 text-[#8a6a00] text-sm px-4 py-3">สินค้าที่ยังไม่มี BOM: {noBom.map((n) => <Link key={n.product_id} href={`/production/bom/${n.product_id}`} className="underline font-semibold mr-2">{n.name}</Link>)} — ระบบไม่คำนวณวัสดุให้รายการนี้ (เพิ่มวัสดุเองในใบเบิกได้)</div>}

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-5">
          <div className="card overflow-x-auto">
            <div className="px-5 py-3 border-b border-line font-display font-bold">สินค้าที่สั่งผลิต</div>
            <table className="tbl"><thead><tr><th>สินค้า</th><th className="text-right">สั่ง</th><th className="text-right">รับดี</th><th className="text-right">เสีย</th><th className="text-right">ค้าง</th>{admin && <th className="text-right">ค่าจ้าง/ชิ้น</th>}<th>หมายเหตุ</th></tr></thead>
              <tbody>{its.map((i) => <tr key={i.id}><td><div className="font-medium">{i.products?.name}</div><div className="text-[11px] text-ink-soft">{i.products?.code}{!i.bom_id && " · ไม่มี BOM"}</div></td><td className="text-right">{i.qty_ordered}</td><td className="text-right text-green">{i.qty_received}</td><td className="text-right text-red">{i.qty_defect || "—"}</td><td className="text-right font-semibold">{Math.max(0, i.qty_ordered - i.qty_received - i.qty_defect)}</td>{admin && <td className="text-right">{fmt(i.wage_per_piece)}</td>}<td className="text-xs text-ink-soft">{i.note}</td></tr>)}</tbody></table>
          </div>

          <div className="card overflow-x-auto">
            <div className="px-5 py-3 border-b border-line flex items-center justify-between"><span className="font-display font-bold">วัสดุตาม BOM</span><span className="text-xs text-ink-soft">ต้องใช้ = จำนวนสั่ง × BOM (รวมเผื่อเสีย)</span></div>
            <table className="tbl"><thead><tr><th>วัสดุ</th><th>ประเภท</th><th className="text-right">ต้องใช้</th><th className="text-right">เบิกแล้ว</th><th className="text-right">คงเหลือในคลัง</th>{admin && <th className="text-right">ต้นทุน/หน่วย</th>}</tr></thead>
              <tbody>{reqs.map((r) => <tr key={r.material_id} className={Number(r.stock) < Number(r.remaining) ? "bg-red/5" : ""}><td><div className="font-medium">{r.name}</div><div className="text-[11px] text-ink-soft">{r.code}</div></td><td className="text-xs">{KIND_TH[r.kind]}</td><td className="text-right">{fmt(r.required)} {r.unit}</td><td className="text-right text-green">{fmt(r.issued)}</td><td className={`text-right ${Number(r.stock) < Number(r.remaining) ? "text-red font-semibold" : ""}`}>{fmt(r.stock)}</td>{admin && <td className="text-right">{fmt(r.unit_cost)}</td>}</tr>)}
                {!reqs.length && <tr><td colSpan={6} className="text-center text-ink-soft py-6">ไม่มีวัสดุจาก BOM</td></tr>}</tbody></table>
          </div>

          {(issues ?? []).length > 0 && <div className="card p-5 space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><Scissors size={16} className="text-purple" /> ใบเบิกวัสดุ</h3>
            {((issues ?? []) as ProductionIssue[]).map((iss) => <div key={iss.id} className="text-sm border-t border-line pt-2 first:border-0 first:pt-0"><div className="flex flex-wrap gap-2"><b className="font-mono text-xs">{iss.issue_no}</b><span>{fmtDate(iss.issued_at)}</span>{admin && <span className="text-ink-soft">ต้นทุน {fmt(iss.total_cost)}</span>}{iss.note && <span className="text-xs text-ink-soft">· {iss.note}</span>}<a href={`/print/production/${id}?issue=${iss.id}`} target="_blank" className="text-xs text-purple underline ml-auto">พิมพ์ใบเบิก</a></div>
              <ul className="text-xs text-ink-soft mt-1 grid sm:grid-cols-2 gap-x-4">{iss.production_issue_items?.map((x) => <li key={x.id}>{x.materials?.name} — {fmt(x.qty)} {x.materials?.unit}</li>)}</ul></div>)}</div>}
          {(receipts ?? []).length > 0 && <div className="card p-5"><h3 className="font-display font-bold mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-green" /> ประวัติการรับสินค้า</h3>
            <ul className="text-sm space-y-1">{((receipts ?? []) as ProductionReceipt[]).map((r) => <li key={r.id} className="flex flex-wrap gap-2"><span>{fmtDate(r.received_at)}</span><span className="text-green">ดี {r.lines.reduce((a, l) => a + Number(l.qty_good), 0)}</span><span className="text-red">เสีย {r.lines.reduce((a, l) => a + Number(l.qty_defect), 0)}</span>{r.stock_receipt_id && <Link href={`/stock/receipts/${r.stock_receipt_id}`} className="text-xs text-purple underline">ใบรับเข้าคลัง</Link>}{r.note && <span className="text-xs text-ink-soft">· {r.note}</span>}</li>)}</ul></div>}
        </div>

        <div className="space-y-4">
          {admin && <div className="card p-5 text-sm space-y-1.5"><div className="font-display font-bold">ต้นทุน (ผู้บริหาร)</div>
            <div className="flex justify-between"><span className="text-ink-soft">วัสดุที่เบิกจริง</span><b>{fmt(d.material_cost)}</b></div><div className="flex justify-between"><span className="text-ink-soft">ค่าจ้างตามที่รับ</span><b>{fmt(d.wage_total)}</b></div>
            <div className="flex justify-between border-t border-line pt-2"><span>รวม</span><b className="text-purple">{fmt(Number(d.material_cost) + Number(d.wage_total))}</b></div>
            {its.reduce((a, i) => a + i.qty_received + i.qty_defect, 0) > 0 && <div className="text-xs text-ink-soft">≈ {fmt((Number(d.material_cost) + Number(d.wage_total)) / its.reduce((a, i) => a + i.qty_received + i.qty_defect, 0))} บาท/ชิ้น (อัปเดตต้นทุนสินค้าแล้ว)</div>}</div>}

          {open && (
            <form action={issueMaterials.bind(null, id)} className="card p-5 space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><Scissors size={18} className="text-purple" /> เบิกวัสดุให้โรงงาน</h3>
              <div><label className="label">วันที่เบิก</label><input type="date" name="issued_at" defaultValue={today} className="input" /></div>
              <div className="space-y-1.5 max-h-72 overflow-auto">{reqs.map((r) => <div key={r.material_id} className="grid grid-cols-[1fr_96px] gap-2 items-center text-sm"><input type="hidden" name="material_id" value={r.material_id} />
                <div className="truncate">{r.name}<div className="text-[10px] text-ink-soft">คงค้าง {fmt(r.remaining)} · คลัง {fmt(r.stock)} {r.unit}</div></div>
                <input type="number" name="issue_qty" step="0.01" min={0} defaultValue={Number(r.remaining) > 0 ? Number(r.remaining) : 0} className="input !py-1 text-right" /></div>)}
                {!reqs.length && <p className="text-xs text-ink-soft">ไม่มีวัสดุจาก BOM — ตั้ง BOM ก่อนเพื่อเบิกอัตโนมัติ</p>}</div>
              <ExtraMaterialPicker />
              <input name="note" className="input" placeholder="หมายเหตุ เช่น ส่งผ้าทางขนส่ง" />
              <button className="btn-primary w-full" disabled={!reqs.length}>ตัดสต็อกวัสดุ + ออกใบเบิก</button>
              <p className="text-[11px] text-ink-soft">เบิกได้หลายครั้ง (ทยอยส่งผ้า) ระบบรวมยอดให้ · ถ้าคลังไม่พอจะบันทึกไม่ได้</p></form>
          )}
          {open && remainingPieces > 0 && (
            <form action={receiveProduction.bind(null, id)} className="card p-5 space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><PackageCheck size={18} className="text-green" /> รับสินค้าสำเร็จรูป</h3>
              <div><label className="label">วันที่รับ</label><input type="date" name="received_at" defaultValue={today} className="input" /></div>
              <div className="space-y-2">{its.filter((i) => i.qty_ordered - i.qty_received - i.qty_defect > 0).map((i) => <div key={i.id} className="grid grid-cols-[1fr_72px_72px] gap-2 items-center text-sm"><input type="hidden" name="item_id" value={i.id} />
                <div className="truncate">{i.products?.name}<div className="text-[10px] text-ink-soft">ค้าง {i.qty_ordered - i.qty_received - i.qty_defect}</div></div>
                <div><div className="text-[10px] text-green">ดี</div><input type="number" name="qty_good" min={0} defaultValue={i.qty_ordered - i.qty_received - i.qty_defect} className="input !py-1 text-right" /></div>
                <div><div className="text-[10px] text-red">เสีย</div><input type="number" name="qty_defect" min={0} defaultValue={0} className="input !py-1 text-right" /></div></div>)}</div>
              <input name="note" className="input" placeholder="หมายเหตุ" />
              <button className="btn-primary w-full">รับเข้าคลังใหญ่</button>
              <p className="text-[11px] text-ink-soft">สินค้าดีเข้าสต็อก · ของเสียเข้ารายการของเสียรอตรวจ · ต้นทุน/ชิ้น = วัสดุเฉลี่ย + ค่าจ้าง</p></form>
          )}
          {!d.expense_id && its.some((i) => i.qty_received + i.qty_defect > 0) && (
            <form action={expenseFromProduction.bind(null, id)} className="card p-5 space-y-3"><h3 className="font-display font-bold flex items-center gap-2"><Receipt size={18} className="text-purple" /> บิลค่าจ้างผลิต</h3>
              <div className="grid grid-cols-2 gap-2"><div><label className="label">เลขที่บิลโรงงาน</label><input name="bill_no" className="input" placeholder="ถ้ามี" /></div><div><label className="label">วันที่บิล</label><input type="date" name="bill_date" defaultValue={today} className="input" /></div></div>
              <div><label className="label">หัก ณ ที่จ่าย %</label><select name="wht_pct" defaultValue={3} className="input">{[0, 1, 2, 3, 5].map((w) => <option key={w} value={w}>{w === 0 ? "ไม่หัก" : `${w}%`}</option>)}</select></div>
              <button className="btn-outline w-full">สร้างบิลค่าใช้จ่าย (รออนุมัติ){admin ? ` ${fmt(d.wage_total)} บาท` : ""}</button>
              <p className="text-[11px] text-ink-soft">คิดจากชิ้นที่รับแล้วทั้งหมด × ค่าจ้าง/ชิ้น · เข้ารอบจ่าย 1/15 และออก 50 ทวิ เมื่อจ่าย</p></form>
          )}
          {d.expense_id && <div className="card p-5 text-sm"><div className="text-xs text-ink-soft">บิลค่าจ้างผลิต</div><Link href={`/expenses/${d.expense_id}`} className="text-purple underline font-mono">{d.expenses?.exp_no ?? "เปิดดู"}</Link> <span className="text-xs text-ink-soft">{d.expenses?.status}</span></div>}
          {open && (admin || (mine && d.status === "draft")) && <ConfirmDelete action={cancelProductionOrder.bind(null, id, new FormData())} label="ยกเลิกใบสั่งผลิต" warning={d.status === "draft" ? "ใบสั่งผลิตนี้จะถูกยกเลิก" : "ใบนี้เบิกวัสดุไปแล้ว — วัสดุที่เบิกไปไม่ถูกคืนอัตโนมัติ (รับคืนในคลังวัสดุเอง)"} />}
        </div>
      </div>
    </div>
  );
}

/** Lets the user add a material that is not in the BOM (rendered server-side as a hint — picking happens on the materials page). */
function ExtraMaterialPicker() {
  return <p className="text-[11px] text-ink-soft">ต้องการเบิกวัสดุนอก BOM? เพิ่มวัสดุนั้นใน BOM ของสินค้า แล้วกลับมาเบิก หรือบันทึกจ่ายออกที่ คลังใหญ่ → ลายผ้า/แพคเกจจิ้ง/อุปกรณ์</p>;
}
