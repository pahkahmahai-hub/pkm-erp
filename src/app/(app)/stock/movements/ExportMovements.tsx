"use client";
import { Download } from "lucide-react";
import { MOVEMENT_TH, type Movement } from "@/lib/stock/types";
import { fmtDateTime } from "@/lib/format";

export function ExportMovements({ rows, ym }: { rows: Movement[]; ym: string }) {
  async function download() {
    const XLSX = await import("xlsx");
    const data = rows.map((m) => ({ "เวลา": fmtDateTime(m.created_at), "ประเภท": MOVEMENT_TH[m.movement_type], "รหัส": m.products?.code ?? "", "สินค้า": m.products?.name ?? "", "จำนวน": m.qty, "ของเสีย +/-": m.defect_delta, "คงเหลือ": m.balance_after, "อ้างอิง": m.ref_no ?? "", "โดย": m.app_users?.display_name ?? "", "หมายเหตุ": m.note ?? "" }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movements");
    XLSX.writeFile(wb, `PKM-stock-movements-${ym}.xlsx`);
  }
  return <button onClick={download} className="btn-outline"><Download size={16} /> Excel</button>;
}
