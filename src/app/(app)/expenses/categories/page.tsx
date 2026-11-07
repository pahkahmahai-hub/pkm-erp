import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { Header } from "@/components/ui";
import type { ExpenseCategory } from "@/lib/expenses/types";
import { saveCategory } from "../actions";

export const dynamic = "force-dynamic";

export default async function Categories({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin();
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("expense_categories").select("*").order("sort_order");
  const rows = (data ?? []) as ExpenseCategory[];
  return (
    <div className="space-y-6">
      <Header title="หมวดค่าใช้จ่าย" sub="กำหนดอัตราหัก ณ ที่จ่ายปกติของแต่ละหมวด — ระบบจะเติมให้ตอนบันทึกบิล" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      <div className="card overflow-x-auto"><table className="tbl">
        <thead><tr><th>รหัส</th><th>ชื่อหมวด</th><th className="w-24">หัก ณ ที่จ่าย %</th><th>ประเภทเงินได้ (บน 50 ทวิ)</th><th className="w-20">ลำดับ</th><th className="w-20">ใช้งาน</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}><td colSpan={7} className="!p-0"><form action={saveCategory} className="grid grid-cols-[100px_1fr_96px_1fr_80px_80px_90px] items-center gap-2 px-3 py-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="code" defaultValue={c.code} className="input !py-1 text-xs font-mono" />
              <input name="name" defaultValue={c.name} className="input !py-1" />
              <input name="wht_pct" type="number" step="0.5" defaultValue={Number(c.wht_pct)} className="input !py-1 text-right" />
              <input name="wht_income_type" defaultValue={c.wht_income_type ?? ""} className="input !py-1 text-xs" placeholder="เช่น ค่าจ้างทำของ มาตรา 40(8)" />
              <input name="sort_order" type="number" defaultValue={c.sort_order} className="input !py-1 text-right" />
              <select name="is_active" defaultValue={c.is_active ? "on" : "off"} className="input !py-1 text-xs"><option value="on">ใช้</option><option value="off">ปิด</option></select>
              <button className="btn-ghost !py-1 text-xs">บันทึก</button>
            </form></td></tr>
          ))}
          <tr><td colSpan={7} className="!p-0 bg-cream/50"><form action={saveCategory} className="grid grid-cols-[100px_1fr_96px_1fr_80px_80px_90px] items-center gap-2 px-3 py-2">
            <input name="code" placeholder="รหัสใหม่" className="input !py-1 text-xs font-mono" required /><input name="name" placeholder="ชื่อหมวดใหม่" className="input !py-1" required />
            <input name="wht_pct" type="number" step="0.5" defaultValue={0} className="input !py-1 text-right" /><input name="wht_income_type" className="input !py-1 text-xs" />
            <input name="sort_order" type="number" defaultValue={100} className="input !py-1 text-right" /><span /><button className="btn-primary !py-1 text-xs">เพิ่ม</button></form></td></tr>
        </tbody></table></div>
    </div>
  );
}
