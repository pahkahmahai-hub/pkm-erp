import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { payrollClient } from "@/lib/payroll/server";
import { periodLabel, type PayrollLine, type PayrollRun } from "@/lib/payroll/calc";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await getSession();
  if (!session.isAdmin) return new NextResponse("forbidden", { status: 403 });
  const sb = await payrollClient();
  const { data: ok } = await sb.rpc("payroll_unlocked");
  if (!ok) return NextResponse.redirect(new URL(`/hr/payroll/unlock?next=/hr/payroll/${runId}`, req.url));
  const type = new URL(req.url).searchParams.get("type") === "bank" ? "bank" : "summary";
  const [{ data: run }, { data: lines }, { data: emps }, { data: settings }] = await Promise.all([
    sb.from("payroll_runs").select("*").eq("id", runId).maybeSingle(),
    sb.from("payroll_lines").select("*").eq("run_id", runId),
    sb.from("employees").select("id, emp_code, title, first_name, last_name, position"),
    sb.from("payroll_settings").select("company_sso_no").eq("id", 1).maybeSingle(),
  ]);
  if (!run) return new NextResponse("not found", { status: 404 });
  const r = run as PayrollRun;
  const E = new Map((emps ?? []).map((e) => [e.id as string, e]));
  const L = ((lines ?? []) as PayrollLine[]).sort((a, b) => String(E.get(a.employee_id)?.emp_code).localeCompare(String(E.get(b.employee_id)?.emp_code)));
  const name = (id: string) => { const e = E.get(id); return e ? `${e.title ?? ""}${e.first_name} ${e.last_name}` : ""; };
  const code = (id: string) => (E.get(id)?.emp_code as string) ?? "";
  const wb = XLSX.utils.book_new();
  const ym = r.period.slice(0, 7);

  if (type === "bank") {
    const rows = L.filter((l) => l.net_pay > 0).map((l, i) => ({ "ลำดับ": i + 1, "รหัสพนักงาน": code(l.employee_id), "ชื่อบัญชี": l.account_name ?? name(l.employee_id), "ธนาคาร": l.bank_name ?? "", "เลขที่บัญชี": l.bank_account ?? "", "จำนวนเงิน": Number(l.net_pay), "หมายเหตุ": `เงินเดือน ${periodLabel(r.period)}` }));
    rows.push({ "ลำดับ": "" as unknown as number, "รหัสพนักงาน": "", "ชื่อบัญชี": "รวม", "ธนาคาร": "", "เลขที่บัญชี": "", "จำนวนเงิน": L.reduce((s, l) => s + Number(l.net_pay), 0), "หมายเหตุ": "" });
    const ws = XLSX.utils.json_to_sheet(rows); ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, "โอนเงิน");
  } else {
    const sum = L.map((l) => ({
      "รหัส": code(l.employee_id), "ชื่อ-นามสกุล": name(l.employee_id), "ตำแหน่ง": (E.get(l.employee_id)?.position as string) ?? "",
      "เงินเดือน": l.salary, "ค่าตำแหน่ง": l.position_allowance, "OT (ชม.)": l.ot_hours_weekday + l.ot_hours_holiday1 + l.ot_hours_holiday3, "ค่า OT": l.ot_amount,
      "คอมมิชชั่น": l.commission_amount, "เบี้ยขยัน": l.diligence, "โบนัส": l.bonus, "รายได้อื่น": l.other_income, "รวมรายได้": l.earnings,
      "หักสาย": l.late_deduct, "หักขาด/ลาไม่รับเงิน": l.absence_deduct, "ฐานประกันสังคม": l.sso_base, "ประกันสังคม (ลูกจ้าง)": l.sso_employee, "ประกันสังคม (นายจ้าง)": l.sso_employer,
      "ภาษีหัก ณ ที่จ่าย": l.tax_wht, "เบิกล่วงหน้า": l.advance, "หักอื่นๆ": l.other_deduct, "รวมหัก": l.total_deduct, "รับสุทธิ": l.net_pay, "หมายเหตุ": [l.other_income_note, l.other_deduct_note, l.note].filter(Boolean).join(" · "),
    }));
    const keys = Object.keys(sum[0] ?? {}).filter((k) => !["รหัส", "ชื่อ-นามสกุล", "ตำแหน่ง", "หมายเหตุ"].includes(k));
    const total: Record<string, string | number> = { "รหัส": "", "ชื่อ-นามสกุล": "รวม" };
    for (const k of keys) total[k] = sum.reduce((s, row) => s + Number((row as Record<string, unknown>)[k] ?? 0), 0);
    const ws = XLSX.utils.json_to_sheet([...sum, total as never]);
    ws["!cols"] = Object.keys(sum[0] ?? { a: 1 }).map((k) => ({ wch: k === "ชื่อ-นามสกุล" ? 26 : 13 }));
    XLSX.utils.book_append_sheet(wb, ws, "สรุปเงินเดือน");
    const sso = L.filter((l) => l.sso_on).map((l) => ({ "รหัส": code(l.employee_id), "ชื่อ-นามสกุล": name(l.employee_id), "ค่าจ้าง (ฐาน)": l.sso_base, "ลูกจ้าง": l.sso_employee, "นายจ้าง": l.sso_employer, "รวมนำส่ง": l.sso_employee + l.sso_employer }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sso.length ? sso : [{ "หมายเหตุ": "งวดนี้ไม่มีการหักประกันสังคม" }]), "ประกันสังคม");
    const tax = L.filter((l) => l.tax_wht > 0).map((l) => ({ "รหัส": code(l.employee_id), "ชื่อ-นามสกุล": name(l.employee_id), "เงินได้": l.earnings - l.late_deduct - l.absence_deduct, "ภาษีหัก ณ ที่จ่าย": l.tax_wht, "วิธี": l.tax_method === "flat3" ? "3% (ภ.ง.ด.3)" : "ภ.ง.ด.1" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tax.length ? tax : [{ "หมายเหตุ": "งวดนี้ไม่มีภาษีหัก ณ ที่จ่าย" }]), "ภาษี");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["บริษัท ปากาม้า (ไทยแลนด์) จำกัด"], ["งวด", periodLabel(r.period)], ["วันที่จ่าย", r.pay_date ?? ""], ["สถานะ", r.status === "closed" ? "ปิดงวดแล้ว" : "ร่าง"], ["เลขที่บัญชีนายจ้าง สปส.", (settings?.company_sso_no as string) ?? ""], ["จำนวนพนักงาน", L.length]]), "ข้อมูลงวด");
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fname = type === "bank" ? `PKM-โอนเงินเดือน-${ym}.xlsx` : `PKM-Payroll-${ym}.xlsx`;
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`, "Cache-Control": "no-store" } });
}
