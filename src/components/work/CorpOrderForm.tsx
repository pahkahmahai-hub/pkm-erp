import Link from "next/link";
import { CORP_STATUS, CORP_PAY, type CorpOrder } from "@/lib/work/corp";
import { saveCorpOrder } from "@/app/(app)/work/actions";

/** ฟอร์มสร้าง/แก้ไขออเดอร์ Corporate */
export function CorpOrderForm({ o, customers, people, today, cancelHref }: { o?: CorpOrder | null; customers: string[]; people: { id: string; name: string }[]; today: string; cancelHref: string }) {
  return (
    <form action={saveCorpOrder.bind(null, o?.id ?? null)} className="card p-5 space-y-5">
      <Section title="ลูกค้า">
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label">ชื่อลูกค้า (ใช้รวมยอด) *</label><input name="customer_name" list="corp-customers" defaultValue={o?.customer_name ?? ""} className="input" required placeholder="เช่น Mandarin Oriental" /><datalist id="corp-customers">{customers.map((c) => <option key={c} value={c} />)}</datalist></div>
          <div><label className="label">ชื่อที่แสดง <span className="font-normal text-ink-soft">(ถ้าต่างจากชื่อลูกค้า เช่น Lot 3.1)</span></label><input name="customer_label" defaultValue={o?.customer_label ?? ""} className="input" /></div>
          <div><label className="label">ผู้ติดต่อ</label><input name="contact_person" defaultValue={o?.contact_person ?? ""} className="input" /></div>
          <div><label className="label">เบอร์โทร / LINE / อีเมล</label><input name="contact_phone" defaultValue={o?.contact_phone ?? ""} className="input" /></div>
        </div>
      </Section>

      <Section title="ออเดอร์">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2"><label className="label">รายการสินค้า *</label><input name="title" defaultValue={o?.title ?? ""} className="input" required placeholder="เช่น ตุ๊กตาช้างเขียว 300 ตัว" /></div>
          <div className="md:col-span-2"><label className="label">รายละเอียดสินค้า / Packaging</label><textarea name="detail" defaultValue={o?.detail ?? ""} className="input" rows={3} placeholder="สกรีนโลโก้ 1 จุด, ถุงหูรูด, Tag, การ์ดข้อความ…" /></div>
          <div><label className="label">มูลค่า (รวม VAT) บาท</label><input name="amount" type="number" step="0.01" min="0" defaultValue={o?.amount ?? ""} className="input" /></div>
          <div><label className="label">ผู้ดูแลออเดอร์</label><select name="owner_id" defaultValue={o?.owner_id ?? ""} className="input"><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        </div>
      </Section>

      <Section title="กำหนดการ">
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="label">วันที่รับออเดอร์</label><input name="order_date" type="date" defaultValue={o?.order_date ?? today} className="input" /></div>
          <div><label className="label">กำหนดรับของจากซัพ/ผู้ผลิต</label><input name="supplier_due" type="date" defaultValue={o?.supplier_due ?? ""} className="input" /></div>
          <div><label className="label">กำหนดส่งลูกค้า</label><input name="due_date" type="date" defaultValue={o?.due_date ?? ""} className="input" /></div>
        </div>
      </Section>

      <Section title="สถานะ">
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label">สถานะงาน</label><select name="status" defaultValue={o?.status ?? "confirm"} className="input">{CORP_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div><label className="label">สถานะเงิน</label><select name="pay_status" defaultValue={o?.pay_status ?? "none"} className="input">{CORP_PAY.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
        </div>
      </Section>

      <Section title="เอกสาร">
        <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="label">ใบเสนอราคา (QT)</label><input name="doc_qt" defaultValue={o?.doc_qt ?? ""} className="input" /></div>
          <div><label className="label">ใบแจ้งหนี้</label><input name="doc_bill" defaultValue={o?.doc_bill ?? ""} className="input" /></div>
          <div><label className="label">ใบกำกับภาษี (IV)</label><input name="doc_iv" defaultValue={o?.doc_iv ?? ""} className="input" /></div>
          <div><label className="label">ใบเสร็จ (DR)</label><input name="doc_dr" defaultValue={o?.doc_dr ?? ""} className="input" /></div>
          <div><label className="label">ใบส่งของชั่วคราว</label><input name="doc_cn" defaultValue={o?.doc_cn ?? ""} className="input" /></div>
        </div>
        <label className="flex items-center gap-2 text-sm mt-2"><input type="checkbox" name="docs_original_sent" defaultChecked={o?.docs_original_sent ?? false} className="accent-purple" /> ส่งเอกสารตัวจริงให้ลูกค้าครบแล้ว</label>
      </Section>

      <div><label className="label">หมายเหตุ</label><textarea name="note" defaultValue={o?.note ?? ""} className="input" rows={2} /></div>
      <div className="flex gap-2"><button className="btn-primary">{o ? "บันทึก" : "สร้างออเดอร์"}</button><Link href={cancelHref} className="btn-ghost">ยกเลิก</Link></div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="text-xs font-semibold text-purple uppercase tracking-wide mb-2">{title}</div>{children}</div>;
}
