import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canSeeCost } from "@/lib/access";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { setReceiptPaid } from "../../actions";
import { DEFECT_TH, type Receipt, type ReceiptItem } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function ReceiptDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const session = await getSession();
  const showCost = canSeeCost(session);
  const supabase = await createClient();
  const [{ data: r }, { data: items }] = await Promise.all([
    supabase.from("receipts").select("*, contacts(name), app_users(display_name)").eq("id", id).maybeSingle(),
    supabase.from("receipt_items").select("*, products(code, name)").eq("receipt_id", id),
  ]);
  if (!r) notFound();
  const rc = r as Receipt;
  return (
    <div className="space-y-6">
      <Header title={`รับเข้า ${rc.receipt_no}`} sub={`${fmtDate(rc.receipt_date)} · ${rc.contacts?.name ?? "ไม่ระบุซัพพลายเออร์"}`} action={<Link href="/stock/receipts" className="btn-ghost">กลับ</Link>} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกรับเข้าแล้ว สต็อกถูกอัปเดต</div>}
      <div className="grid md:grid-cols-4 gap-4 text-sm">
        <div className="card p-4"><div className="text-xs text-ink-soft">เอกสารอ้างอิง</div><div className="font-semibold">{rc.supplier_doc_no ?? "—"}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft">เข้าคลัง / ของเสีย</div><div className="font-semibold"><span className="text-green">{rc.total_good}</span> / <span className="text-red">{rc.total_defect}</span></div></div>
        <div className="card p-4">
          <div className="text-xs text-ink-soft">ชำระเงิน</div>
          <div className="flex items-center gap-2">
            {rc.payment_status === "paid" ? <span className="badge-ok">ชำระแล้ว {rc.paid_at ? fmtDate(rc.paid_at) : ""}</span> : <span className="badge-pending">รอชำระ</span>}
            <form action={setReceiptPaid.bind(null, id, rc.payment_status !== "paid")}><button className="text-xs text-purple underline">{rc.payment_status === "paid" ? "ตั้งเป็นรอชำระ" : "ทำเครื่องหมายชำระแล้ว"}</button></form>
          </div>
        </div>
        <div className="card p-4"><div className="text-xs text-ink-soft">บันทึกโดย</div><div className="font-semibold">{rc.app_users?.display_name ?? "—"}</div><div className="text-xs text-ink-soft">{fmtDateTime(rc.created_at)}</div></div>
      </div>
      {rc.note && <div className="card p-4 text-sm"><span className="text-ink-soft">หมายเหตุ:</span> {rc.note}</div>}
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>รหัส</th><th>สินค้า</th><th className="text-right">จำนวน</th><th>สภาพ</th>{showCost && <th className="text-right">ต้นทุน/หน่วย</th>}<th>หมายเหตุ</th></tr></thead>
          <tbody>
            {((items ?? []) as ReceiptItem[]).map((i) => (
              <tr key={i.id}>
                <td className="font-mono text-xs">{i.products?.code}</td>
                <td>{i.products?.name}</td>
                <td className="text-right font-semibold">{i.qty}</td>
                <td>{i.condition === "good" ? <span className="badge-ok">ดี → เข้าคลัง</span> : <span className="badge-rejected">เสีย · {i.defect_action ? DEFECT_TH[i.defect_action] : ""}</span>}</td>
                {showCost && <td className="text-right">{i.unit_cost != null ? Number(i.unit_cost).toLocaleString() : "—"}</td>}
                <td className="text-xs text-ink-soft">{i.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
