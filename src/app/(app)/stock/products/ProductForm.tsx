import type { Product } from "@/lib/stock/types";

export function ProductForm({ p, depts, subDepts, showCost = false }: { p?: Product | null; depts: string[]; subDepts: string[]; showCost?: boolean }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <F label="รหัสสินค้า *"><input name="code" defaultValue={p?.code ?? ""} className="input font-mono" required /></F>
      <F label="บาร์โค้ด"><input name="barcode" defaultValue={p?.barcode ?? ""} className="input font-mono" /></F>
      <F label="หน่วย"><input name="unit" defaultValue={p?.unit ?? "ชิ้น"} className="input" /></F>
      <div className="md:col-span-3"><F label="ชื่อสินค้า *"><input name="name" defaultValue={p?.name ?? ""} className="input" required /></F></div>
      <F label="หมวด (Dept)"><input name="dept" list="depts" defaultValue={p?.dept ?? ""} className="input" /><datalist id="depts">{depts.map((d) => <option key={d} value={d} />)}</datalist></F>
      <F label="หมวดย่อย (Sub Dept)"><input name="sub_dept" list="subdepts" defaultValue={p?.sub_dept ?? ""} className="input" /><datalist id="subdepts">{subDepts.map((d) => <option key={d} value={d} />)}</datalist></F>
      <F label="สต็อกขั้นต่ำ (แจ้งเตือน)"><input name="min_alert" type="number" defaultValue={p?.min_alert ?? 0} className="input" /></F>
      <F label="ราคาขาย"><input name="price" type="number" step="0.01" defaultValue={p?.price ?? 0} className="input" /></F>
      {showCost && <F label="ต้นทุน (ผู้ดูแลเห็นเท่านั้น)"><input name="cost" type="number" step="0.01" defaultValue={p?.cost ?? ""} className="input" /></F>}
      {!p && <F label="ยอดเริ่มต้น (ชิ้น)"><input name="opening_qty" type="number" defaultValue={0} className="input" /></F>}
      <div className="md:col-span-3"><F label="หมายเหตุ"><input name="notes" defaultValue={p?.notes ?? ""} className="input" /></F></div>
      {p && (
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" name="is_active" value="on" defaultChecked={p.is_active} className="accent-purple" /> เปิดใช้งาน (ปิด = ซ่อนจากรายการ แต่เก็บประวัติไว้)
          <input type="hidden" name="is_active" value="off" />
        </label>
      )}
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
