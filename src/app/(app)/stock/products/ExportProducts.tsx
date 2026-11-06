"use client";
import { Download } from "lucide-react";
import type { Product } from "@/lib/stock/types";

export function ExportProducts({ products }: { products: Product[] }) {
  async function download() {
    const XLSX = await import("xlsx");
    const rows = products.map((p) => ({ "รหัส": p.code, "ชื่อสินค้า": p.name, "บาร์โค้ด": p.barcode ?? "", "หมวด": p.dept ?? "", "หมวดย่อย": p.sub_dept ?? "", "ราคา": Number(p.price), "คงเหลือ": p.stock_qty, "ของเสีย": p.defect_qty, "ขั้นต่ำ": p.min_alert }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, `PKM-stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  return <button onClick={download} className="btn-outline"><Download size={16} /> Excel</button>;
}
