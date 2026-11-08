import Link from "next/link";
import { Plus, FileText, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { PSTATUS_TH, PSTATUS_BADGE, type PurchaseDoc } from "@/lib/purchase/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function PurchaseHome() {
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: sum }, { data: recent }] = await Promise.all([
    supabase.rpc("purchase_summary"),
    supabase.from("purchase_docs").select("*, companies(code)").order("created_at", { ascending: false }).limit(12),
  ]);
  const rows = (recent ?? []) as (PurchaseDoc & { companies: { code: string } })[];
  return (
    <div className="space-y-6">
      <Header title="จัดซื้อ" sub={session.isAdmin ? "ใบขอซื้อภายใน (PR) → อนุมัติ → ใบสั่งซื้อ (PO) → รับของเข้าคลัง → บิลค่าใช้จ่าย" : "เปิดใบขอซื้อ (PR) ให้ผู้บริหารอนุมัติ แล้วแปลงเป็นใบสั่งซื้อส่งซัพพลายเออร์"}
        action={<div className="flex gap-2"><Link href="/purchase/requests/new" className="btn-primary"><Plus size={16} /> เปิดใบขอซื้อ (PR)</Link>{session.isAdmin && <Link href="/purchase/orders/new" className="btn-outline"><ShoppingCart size={16} /> เปิด PO ตรง</Link>}</div>} />
      {sum && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="PR รออนุมัติ" value={`${sum.pr_pending} ใบ`} tone="yellow" href="/purchase/requests?status=pending" />
          <Stat label="PR อนุมัติแล้ว · รอเปิด PO" value={`${sum.pr_approved} ใบ`} tone="teal" href="/purchase/requests?status=approved" />
          <Stat label={`PO รอของ ${sum.po_open} ใบ${Number(sum.awaiting_goods) ? ` · เลยกำหนด ${sum.awaiting_goods}` : ""}`} value={`฿${fmt(sum.po_open_amount)}`} tone="purple" href="/purchase/orders?status=sent" />
          <Stat label="สั่งซื้อเดือนนี้" value={`฿${fmt(sum.po_month)}`} tone="coral" href="/purchase/orders" />
        </div>
      )}
      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-line font-display font-bold flex items-center gap-2"><FileText size={16} className="text-purple" /> รายการล่าสุด</div>
        <table className="tbl">
          <thead><tr><th>เลขที่</th><th>ประเภท</th><th>วันที่</th><th>ซัพพลายเออร์ / วัตถุประสงค์</th><th className="text-right">ยอด</th><th>สถานะ</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            <td><Link href={`/purchase/${r.doc_type === "po" ? "orders" : "requests"}/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.doc_no}</Link></td>
            <td className="text-xs">{r.doc_type === "po" ? "ใบสั่งซื้อ" : "ใบขอซื้อ"}</td><td className="whitespace-nowrap">{fmtDate(r.doc_date)}</td>
            <td><div className="font-medium">{r.supplier_name ?? "—"}</div>{r.purpose && <div className="text-xs text-ink-soft truncate max-w-[320px]">{r.purpose}</div>}</td>
            <td className="text-right font-semibold">{fmt(r.grand_total)}</td><td><span className={PSTATUS_BADGE[r.status]}>{PSTATUS_TH[r.status]}</span></td></tr>)}
            {!rows.length && <tr><td colSpan={6} className="text-center text-ink-soft py-10">ยังไม่มีเอกสาร — เริ่มจาก “เปิดใบขอซื้อ (PR)”</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
