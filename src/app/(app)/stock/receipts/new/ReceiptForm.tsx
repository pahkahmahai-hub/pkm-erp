"use client";

import { useState } from "react";
import { LineItemsEditor, type LineItem } from "@/components/stock/LineItemsEditor";
import { ContactPicker } from "@/components/stock/ContactPicker";
import { createReceipt } from "../../actions";
import type { Product, Contact } from "@/lib/stock/types";

export function ReceiptForm({ products, suppliers, showCost }: { products: Pick<Product, "id" | "code" | "name" | "barcode" | "stock_qty" | "unit">[]; suppliers: Pick<Contact, "id" | "name" | "code" | "tax_id">[]; showCost: boolean }) {
  const [items, setItems] = useState<LineItem[]>([]);
  const good = items.filter((i) => i.condition !== "defect").reduce((a, i) => a + i.qty, 0);
  const bad = items.filter((i) => i.condition === "defect").reduce((a, i) => a + i.qty, 0);
  const payload = items.map((i) => ({ product_id: i.product_id, qty: i.qty, condition: i.condition ?? "good", defect_action: i.defect_action ?? "review", unit_cost: i.unit_cost ?? "", note: i.note ?? "" }));

  return (
    <form action={createReceipt} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <div className="card p-6 grid md:grid-cols-2 gap-4">
        <ContactPicker kind="supplier" contacts={suppliers} label="ซัพพลายเออร์" />
        <div><label className="label">เลขที่ใบส่งของ / ใบแจ้งหนี้ของซัพพลายเออร์</label><input name="supplier_doc_no" className="input" placeholder="เช่น INV-2569-0123" /></div>
        <div><label className="label">วันที่รับ</label><input name="receipt_date" type="date" className="input" /></div>
        <div>
          <label className="label">สถานะชำระเงิน</label>
          <div className="flex gap-4 py-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="payment_status" value="unpaid" defaultChecked className="accent-purple" /> รอชำระ</label>
            <label className="flex items-center gap-2"><input type="radio" name="payment_status" value="paid" className="accent-purple" /> ชำระแล้ว</label>
          </div>
        </div>
        <div className="md:col-span-2"><label className="label">หมายเหตุ</label><input name="note" className="input" /></div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-display font-bold">รายการสินค้า</h2>
        <LineItemsEditor products={products} items={items} onChange={setItems} mode="receive" showCost={showCost} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={!items.length} className="btn-primary">บันทึกรับเข้า</button>
        <a href="/stock/receipts" className="btn-ghost">ยกเลิก</a>
        <span className="text-sm text-ink-soft ml-auto">เข้าคลัง <b className="text-green">{good}</b> · ของเสีย <b className="text-red">{bad}</b></span>
      </div>
    </form>
  );
}
