"use client";

import { Download } from "lucide-react";
import type { ReportRow } from "@/lib/report";

export function ExportButton({ rows, leaveTypes, ym }: { rows: ReportRow[]; leaveTypes: { code: string; name_th: string }[]; ym: string }) {
  async function download() {
    const XLSX = await import("xlsx");
    const data = rows.map((r) => {
      const o: Record<string, string | number> = {
        "รหัสพนักงาน": r.emp_code,
        "ชื่อ-นามสกุล": r.name,
        "ทีม": r.team,
        "วันทำงาน": r.workdays,
        "มาทำงาน": r.present,
        "สาย (ครั้ง)": r.late,
        "สายรวม (นาที)": r.late_minutes,
        "นอกพื้นที่ (ครั้ง)": r.outside,
      };
      leaveTypes.forEach((t) => (o[t.name_th] = r.leave[t.code] ?? 0));
      o["ขาด"] = r.absent;
      o["OT (ชม.)"] = r.ot_hours;
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "สรุปเวลา");
    XLSX.writeFile(wb, `PKM-HR-${ym}.xlsx`);
  }
  return (
    <button onClick={download} className="btn-outline"><Download size={16} /> Export Excel</button>
  );
}
