import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { monthBkk } from "@/lib/today";
import { createPurchaseRequisition } from "../actions";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
interface Line { product_id: string | null; code: string; description: string; barcode: string | null; qty: number; retail: number; unit_price: number; amount: number; sold_amount: number; refs: string[] }
interface Preview { month: string; discount_pct: number; doc_refs: string[]; lines: Line[]; total_qty: number; total_amount: number; existing_pr: { id: string; doc_no: string; status: string }[] | null }
const prevMonth = () => { const [y, m] = monthBkk().split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const nextMonthFirst = (ym: string) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const thMonth = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" });

export default async function MonthClose({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const { month = prevMonth(), error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("tks_month_lines", { p_month: `${month}-01` });
  const v = data as Preview | null;
  const lines = v?.lines ?? [];
  const existing = v?.existing_pr ?? [];
  const unmatched = lines.filter((l) => !l.product_id);
  return (
    <div className="space-y-6">
      <Header title="ปิดเดือน → ใบเบิกซื้อทีฆาซอร์ส" sub="รวมยอดขายของทีฆาซอร์สทั้งเดือนเป็นรายสินค้า (ใบเสร็จ/ใบกำกับ TKS + แพลตฟอร์มที่ออกบิลในนาม TKS) → เบิกซื้อจากปากาม้าในราคาส่ง"
        action={<form className="flex items-center gap-2"><input type="month" name="month" defaultValue={month} className="input" /><button className="btn-ghost">ดู</button></form>} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <div className="grid sm:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-xs text-ink-soft">เดือนที่สรุป</div><div className="font-display text-lg font-bold">{thMonth(month)}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft">จำนวนสินค้า / ชิ้น</div><div className="font-display text-lg font-bold">{lines.length} รายการ · {Number(v?.total_qty ?? 0)} ชิ้น</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft">ราคาส่ง = ราคาขาย ลด</div><div className="font-display text-lg font-bold">{Number(v?.discount_pct ?? 40)}%</div></div>
        <div className="card p-4 bg-purple text-white"><div className="text-xs opacity-80">ยอดเบิกซื้อสุทธิ (รวม VAT)</div><div className="font-display text-lg font-bold">฿{fmt(v?.total_amount ?? 0)}</div></div>
      </div>

      {existing.length > 0 && <div className="rounded-xl bg-yellow/15 text-[#8a6a00] text-sm px-4 py-3">เดือนนี้มีใบเบิกซื้อแล้ว: {existing.map((e) => <Link key={e.id} href={`/sales/docs/${e.id}`} className="underline font-semibold mr-2">{e.doc_no}</Link>)} — ถ้าต้องการออกใหม่ ให้ยกเลิกใบเดิมก่อน</div>}
      {(v?.doc_refs?.length ?? 0) > 0 && <p className="text-sm text-ink-soft">รวมจากเอกสาร TKS: {v!.doc_refs.join(", ")}</p>}
      {unmatched.length > 0 && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{unmatched.length} รายการไม่พบสินค้าในระบบ (ราคาส่งจะเป็น 0) — แก้ชื่อ/บาร์โค้ดในยอดขายออนไลน์ก่อนสร้าง: {unmatched.map((u) => u.description).join(", ")}</div>}

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>#</th><th>รหัส</th><th>สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">ราคาขาย</th><th className="text-right">ราคาส่ง/หน่วย</th><th className="text-right">จำนวนเงิน</th><th className="text-right">ยอดขายจริง</th><th>ที่มา</th></tr></thead>
          <tbody>
            {lines.map((l, i) => <tr key={(l.product_id ?? l.barcode ?? l.description) + i} className={!l.product_id ? "bg-red/5" : ""}>
              <td className="text-ink-soft">{i + 1}</td><td className="font-mono text-xs">{l.code || "—"}</td>
              <td><div className="font-medium">{l.description}</div><div className="text-[11px] text-ink-soft font-mono">{l.barcode}</div></td>
              <td className="text-right font-semibold">{Number(l.qty)}</td><td className="text-right text-ink-soft">{fmt(l.retail)}</td><td className="text-right">{fmt(l.unit_price)}</td><td className="text-right font-bold">{fmt(l.amount)}</td>
              <td className="text-right text-ink-soft">{fmt(l.sold_amount)}</td><td className="text-[11px] text-ink-soft">{(l.refs ?? []).join(", ")}</td></tr>)}
            {!lines.length && <tr><td colSpan={9} className="text-center text-ink-soft py-10">ไม่มียอดขายของทีฆาซอร์สในเดือนนี้ — บันทึกยอดขายออนไลน์รายสินค้า หรือออกใบเสร็จในนาม TKS ก่อน</td></tr>}
          </tbody>
          {lines.length > 0 && <tfoot><tr className="font-bold"><td colSpan={3}>รวม</td><td className="text-right">{Number(v?.total_qty ?? 0)}</td><td /><td /><td className="text-right">{fmt(v?.total_amount ?? 0)}</td><td className="text-right text-ink-soft">{fmt(lines.reduce((a, l) => a + Number(l.sold_amount), 0))}</td><td /></tr></tfoot>}
        </table>
      </div>

      {lines.length > 0 && existing.length === 0 && (
        <form action={createPurchaseRequisition} className="card p-5 flex flex-wrap items-end gap-4">
          <input type="hidden" name="month" value={month} />
          <div><label className="label">วันที่ใบเบิกซื้อ (ต้นเดือนถัดไป)</label><input type="date" name="doc_date" defaultValue={nextMonthFirst(month)} className="input" /></div>
          <button className="btn-primary">สร้างใบเบิกซื้อ ในนามทีฆาซอร์ส → ปากาม้า</button>
          <p className="text-xs text-ink-soft basis-full">สร้างเป็นฉบับร่าง เปิดตรวจ/พิมพ์ได้ จากนั้นในหน้าเอกสารจะมีปุ่ม “ออกใบส่งสินค้า/ใบกำกับภาษี PKM → TKS” เพื่อออกใบคู่กันฝั่งปากาม้าและตัดสต็อกคลังใหญ่</p>
        </form>
      )}
    </div>
  );
}
