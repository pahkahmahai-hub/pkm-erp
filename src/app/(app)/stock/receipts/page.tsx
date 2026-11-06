import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Receipt } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("receipts").select("*, contacts(name), app_users(display_name)").order("receipt_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (status === "unpaid" || status === "paid") q = q.eq("payment_status", status);
  const { data } = await q;
  const rows = (data ?? []) as Receipt[];
  const unpaid = rows.filter((r) => r.payment_status === "unpaid").length;

  return (
    <div className="space-y-6">
      <Header title="รับเข้าสินค้า" sub={`${rows.length} ใบ · รอชำระ ${unpaid}`} action={<Link href="/stock/receipts/new" className="btn-primary"><Plus size={16} /> บันทึกรับเข้า</Link>} />
      <div className="flex gap-2">
        {[["", "ทั้งหมด"], ["unpaid", "รอชำระเงิน"], ["paid", "ชำระแล้ว"]].map(([k, l]) => (
          <Link key={k} href={`/stock/receipts${k ? `?status=${k}` : ""}`} className={status === k ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>{l}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead><tr><th>เลขที่</th><th>วันที่</th><th>ซัพพลายเออร์</th><th>เอกสารอ้างอิง</th><th className="text-right">ดี</th><th className="text-right">เสีย</th><th>ชำระเงิน</th><th>โดย</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/stock/receipts/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.receipt_no}</Link></td>
                <td>{fmtDate(r.receipt_date)}</td>
                <td>{r.contacts?.name ?? "—"}</td>
                <td className="text-xs">{r.supplier_doc_no ?? "—"}</td>
                <td className="text-right text-green font-semibold">{r.total_good}</td>
                <td className="text-right text-red">{r.total_defect || "—"}</td>
                <td>{r.payment_status === "paid" ? <span className="badge-ok">ชำระแล้ว</span> : <span className="badge-pending">รอชำระ</span>}</td>
                <td className="text-xs">{r.app_users?.display_name ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-8">ยังไม่มีรายการ</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
