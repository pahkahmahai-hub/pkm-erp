"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { PAYROLL_COOKIE, payrollClient, requirePayroll, loadPayrollSettings } from "@/lib/payroll/server";
import { computeLine, hourlyOf, ssoActive, type PayrollLine, type PayrollProfile, type PayrollSettings } from "@/lib/payroll/calc";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const BASE = "/hr/payroll";
const safeNext = (s: string | null) => (s && s.startsWith("/hr/payroll") ? s : BASE);

// ---------------- lock / unlock ----------------
export async function unlockPayroll(formData: FormData) {
  const session = await getSession();
  if (!session.isAdmin) redirect("/hr");
  const supabase = await createClient();
  const next = safeNext(nul(formData.get("next")));
  const { data, error } = await supabase.rpc("payroll_unlock", { p_password: String(formData.get("password") ?? "") });
  const res = (data ?? {}) as { token?: string; error?: string };
  if (error || !res.token) redirect(`${BASE}/unlock?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error?.message ?? res.error ?? "ปลดล็อกไม่สำเร็จ")}`);
  (await cookies()).set(PAYROLL_COOKIE, res.token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 });
  redirect(next);
}

export async function lockPayroll() {
  const supabase = await createClient();
  await supabase.rpc("payroll_lock");
  (await cookies()).delete(PAYROLL_COOKIE);
  redirect("/hr");
}

export async function setPayrollPassword(formData: FormData) {
  const session = await getSession();
  if (!session.isAdmin) redirect("/hr");
  const supabase = await createClient();
  const p1 = String(formData.get("new_password") ?? ""); const p2 = String(formData.get("confirm") ?? "");
  const back = nul(formData.get("back")) ?? `${BASE}/unlock`;
  if (p1 !== p2) redirect(`${back}?error=${encodeURIComponent("รหัสผ่านใหม่ 2 ช่องไม่ตรงกัน")}`);
  const { error } = await supabase.rpc("payroll_set_password", { p_old: nul(formData.get("old_password")), p_new: p1 });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  (await cookies()).delete(PAYROLL_COOKIE);
  redirect(`${BASE}/unlock?msg=${encodeURIComponent("ตั้งรหัสผ่านแล้ว — ใส่รหัสเพื่อเข้า PAYROLL")}`);
}

// ---------------- settings / profiles ----------------
export async function savePayrollSettings(formData: FormData) {
  const { sb } = await requirePayroll(`${BASE}/settings`);
  const f = (k: string) => num(formData.get(k));
  const ssoStart = nul(formData.get("sso_start_month"));
  const { error } = await sb.from("payroll_settings").update({
    sso_rate: f("sso_rate"), sso_min_base: f("sso_min_base"), sso_max_base: f("sso_max_base"), sso_start_month: ssoStart ? `${ssoStart.slice(0, 7)}-01` : "2027-01-01",
    days_per_month: f("days_per_month") || 30, hours_per_day: f("hours_per_day") || 8, ot_weekday_mult: f("ot_weekday_mult"), holiday_work_mult: f("holiday_work_mult"), ot_holiday_mult: f("ot_holiday_mult"),
    personal_allowance: f("personal_allowance"), expense_rate: f("expense_rate"), expense_cap: f("expense_cap"), company_sso_no: nul(formData.get("company_sso_no")), updated_at: new Date().toISOString(),
  }).eq("id", 1);
  if (error) redirect(`${BASE}/settings?error=${encodeURIComponent(error.message)}`);
  redirect(`${BASE}/settings?saved=1`);
}

export async function savePayrollProfile(employeeId: string, formData: FormData) {
  const { sb } = await requirePayroll(`${BASE}/profiles`);
  const otRate = nul(formData.get("ot_hourly_rate"));
  const { error } = await sb.from("payroll_profiles").upsert({
    employee_id: employeeId, base_salary: num(formData.get("base_salary")), position_allowance: num(formData.get("position_allowance")), commission_rate: num(formData.get("commission_rate")),
    ot_hourly_rate: otRate ? Number(otRate) : null, deduct_late: formData.get("deduct_late") === "on", sso_enabled: formData.get("sso_enabled") === "on",
    tax_method: String(formData.get("tax_method") ?? "pnd1"), tax_fixed: num(formData.get("tax_fixed")), tax_extra_deduction: num(formData.get("tax_extra_deduction")),
    bank_name: nul(formData.get("bank_name")), bank_account: nul(formData.get("bank_account")), account_name: nul(formData.get("account_name")),
    include_in_payroll: formData.get("include_in_payroll") === "on", note: nul(formData.get("note")), updated_at: new Date().toISOString(),
  });
  if (error) redirect(`${BASE}/profiles/${employeeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`${BASE}/profiles`);
  redirect(`${BASE}/profiles?saved=1`);
}

// ---------------- auto data (OT / สาย / ขาด) ----------------
type Sb = Awaited<ReturnType<typeof payrollClient>>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, k: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + k * 86400_000));
const todayBkk = () => iso(new Date(Date.now() + 7 * 3600_000));

async function gatherAuto(sb: Sb, period: string, s: PayrollSettings, empIds: string[]) {
  const start = period; const [y, m] = period.split("-").map(Number);
  const end = iso(new Date(Date.UTC(y, m, 0)));
  const [{ data: ots }, { data: att }, { data: leaves }, { data: hol }, { data: emps }] = await Promise.all([
    sb.from("ot_requests").select("employee_id, work_date, hours_requested, hours_approved").eq("status", "approved").gte("work_date", start).lte("work_date", end).in("employee_id", empIds),
    sb.from("attendance").select("employee_id, work_date, late_minutes").gte("work_date", start).lte("work_date", end).in("employee_id", empIds),
    sb.from("leave_requests").select("employee_id, start_date, end_date").eq("status", "approved").lte("start_date", end).gte("end_date", start).in("employee_id", empIds),
    sb.from("holidays").select("holiday_date").gte("holiday_date", start).lte("holiday_date", end),
    sb.from("employees").select("id, start_date, end_date").in("id", empIds),
  ]);
  const holidays = new Set((hol ?? []).map((h) => h.holiday_date as string));
  const isOff = (d: string) => { const dow = new Date(d + "T00:00:00Z").getUTCDay(); return dow === 0 || dow === 6 || holidays.has(d); };
  const out = new Map<string, { wk: number; h1: number; h3: number; late: number; absent: number }>();
  for (const id of empIds) out.set(id, { wk: 0, h1: 0, h3: 0, late: 0, absent: 0 });
  for (const o of ots ?? []) {
    const r = out.get(o.employee_id as string)!; const h = Number(o.hours_approved ?? o.hours_requested) || 0;
    if (isOff(o.work_date as string)) { const base = Math.min(h, s.hours_per_day); r.h1 += base; r.h3 += h - base; } else r.wk += h;
  }
  const attSet = new Set<string>();
  for (const a of att ?? []) { out.get(a.employee_id as string)!.late += Number(a.late_minutes) || 0; attSet.add(`${a.employee_id}|${a.work_date}`); }
  const lastDay = [end, todayBkk()].sort()[0];
  for (const e of emps ?? []) {
    const from = [start, (e.start_date as string) ?? start].sort().reverse()[0];
    const to = [lastDay, (e.end_date as string) ?? lastDay].sort()[0];
    let absent = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (isOff(d) || attSet.has(`${e.id}|${d}`)) continue;
      if ((leaves ?? []).some((l) => l.employee_id === e.id && (l.start_date as string) <= d && (l.end_date as string) >= d)) continue;
      absent++;
    }
    out.get(e.id as string)!.absent = absent;
  }
  return out;
}

const profileFor = (profiles: PayrollProfile[], id: string) => profiles.find((p) => p.employee_id === id) ?? null;

export async function createPayrollRun(formData: FormData) {
  const { sb } = await requirePayroll(BASE);
  const ym = nul(formData.get("period"));
  if (!ym) redirect(`${BASE}?error=${encodeURIComponent("เลือกเดือน")}`);
  const period = `${ym.slice(0, 7)}-01`;
  const s = await loadPayrollSettings(sb);
  const { data: run, error } = await sb.from("payroll_runs").insert({ period, pay_date: nul(formData.get("pay_date")) }).select("id").single();
  if (error) redirect(`${BASE}?error=${encodeURIComponent(error.message.includes("duplicate") ? "มีงวดเดือนนี้แล้ว" : error.message)}`);
  const [{ data: emps }, { data: profs }] = await Promise.all([
    sb.from("employees").select("id, status, end_date").neq("status", "resigned"),
    sb.from("payroll_profiles").select("*"),
  ]);
  const profiles = (profs ?? []) as PayrollProfile[];
  const ids = (emps ?? []).map((e) => e.id as string).filter((id) => profileFor(profiles, id)?.include_in_payroll !== false);
  const auto = await gatherAuto(sb, period, s, ids);
  const rows = ids.map((id) => {
    const p = profileFor(profiles, id); const a = auto.get(id)!;
    const line = {
      run_id: run.id, employee_id: id, salary: p?.base_salary ?? 0, position_allowance: p?.position_allowance ?? 0, hourly_rate: p ? hourlyOf(p, s) : 0,
      commission_rate: p?.commission_rate ?? 0, ot_hours_weekday: a.wk, ot_hours_holiday1: a.h1, ot_hours_holiday3: a.h3, late_minutes: a.late, absent_days: p?.base_salary ? a.absent : 0,
      sso_on: !!p?.sso_enabled && ssoActive(period, s), tax_method: p?.tax_method ?? "pnd1", deduct_late: p?.deduct_late ?? true,
      bank_name: p?.bank_name ?? null, bank_account: p?.bank_account ?? null, account_name: p?.account_name ?? null,
    } as unknown as PayrollLine;
    const c = computeLine({ ...emptyLine(), ...line }, s, p);
    const { id: _id, ...rest } = c; void _id;
    return rest;
  });
  if (rows.length) {
    const { error: e2 } = await sb.from("payroll_lines").insert(rows);
    if (e2) redirect(`${BASE}/${run.id}?error=${encodeURIComponent(e2.message)}`);
  }
  redirect(`${BASE}/${run.id}?created=1`);
}

/** ดึง OT / นาทีสาย / วันขาด ใหม่ทั้งงวด (ไม่แตะช่องที่กรอกเองอื่นๆ) */
export async function refreshPayrollAuto(runId: string) {
  const { sb } = await requirePayroll(`${BASE}/${runId}`);
  const s = await loadPayrollSettings(sb);
  const [{ data: run }, { data: lines }, { data: profs }] = await Promise.all([
    sb.from("payroll_runs").select("*").eq("id", runId).single(),
    sb.from("payroll_lines").select("*").eq("run_id", runId),
    sb.from("payroll_profiles").select("*"),
  ]);
  if (run?.status !== "draft") redirect(`${BASE}/${runId}?error=${encodeURIComponent("งวดปิดแล้ว — เปิดแก้ไขก่อน")}`);
  const L = (lines ?? []) as PayrollLine[];
  const auto = await gatherAuto(sb, run.period as string, s, L.map((l) => l.employee_id));
  for (const l of L) {
    const a = auto.get(l.employee_id)!; const p = profileFor((profs ?? []) as PayrollProfile[], l.employee_id);
    const c = computeLine({ ...l, ot_hours_weekday: a.wk, ot_hours_holiday1: a.h1, ot_hours_holiday3: a.h3, late_minutes: a.late, absent_days: l.salary ? a.absent : 0 }, s, p);
    await sb.from("payroll_lines").update(stripId(c)).eq("id", l.id);
  }
  revalidatePath(`${BASE}/${runId}`);
  redirect(`${BASE}/${runId}?refreshed=1`);
}

export async function savePayrollLine(lineId: string, runId: string, formData: FormData) {
  const { sb } = await requirePayroll(`${BASE}/${runId}`);
  const s = await loadPayrollSettings(sb);
  const { data: line } = await sb.from("payroll_lines").select("*").eq("id", lineId).single();
  const { data: run } = await sb.from("payroll_runs").select("status").eq("id", runId).single();
  if (!line || run?.status !== "draft") redirect(`${BASE}/${runId}?error=${encodeURIComponent("งวดปิดแล้ว — เปิดแก้ไขก่อน")}`);
  const { data: prof } = await sb.from("payroll_profiles").select("*").eq("employee_id", line.employee_id).maybeSingle();
  const numKeys = ["salary", "position_allowance", "ot_hours_weekday", "ot_hours_holiday1", "ot_hours_holiday3", "hourly_rate", "commission_sales", "commission_rate", "commission_amount", "diligence", "bonus", "other_income", "late_minutes", "absent_days", "unpaid_leave_days", "advance", "other_deduct"] as const;
  const upd: Record<string, unknown> = {};
  for (const k of numKeys) upd[k] = num(formData.get(k));
  upd.sso_on = formData.get("sso_on") === "on";
  upd.deduct_late = formData.get("deduct_late") === "on";
  upd.tax_method = String(formData.get("tax_method") ?? line.tax_method);
  upd.tax_manual = formData.get("tax_manual") === "on";
  if (upd.tax_manual) upd.tax_wht = num(formData.get("tax_wht"));
  for (const k of ["other_income_note", "other_deduct_note", "note", "bank_name", "bank_account", "account_name"]) upd[k] = nul(formData.get(k));
  const c = computeLine({ ...(line as PayrollLine), ...(upd as Partial<PayrollLine>) } as PayrollLine, s, prof as PayrollProfile | null);
  const { error } = await sb.from("payroll_lines").update({ ...stripId(c), updated_at: new Date().toISOString() }).eq("id", lineId);
  if (error) redirect(`${BASE}/${runId}/${lineId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`${BASE}/${runId}`);
  redirect(`${BASE}/${runId}?saved=${lineId}`);
}

export async function setPayrollRunStatus(runId: string, status: "draft" | "closed") {
  const { sb, session } = await requirePayroll(`${BASE}/${runId}`);
  const { error } = await sb.from("payroll_runs").update(status === "closed" ? { status, closed_at: new Date().toISOString(), closed_by: session.appUser.id } : { status, closed_at: null, closed_by: null }).eq("id", runId);
  if (error) redirect(`${BASE}/${runId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`${BASE}/${runId}`);
  redirect(`${BASE}/${runId}`);
}

/** เปิด/ปิด การหักสาย ทั้งงวด */
export async function setRunDeductLate(runId: string, on: boolean) {
  const { sb } = await requirePayroll(`${BASE}/${runId}`);
  const s = await loadPayrollSettings(sb);
  const [{ data: run }, { data: lines }] = await Promise.all([sb.from("payroll_runs").select("status").eq("id", runId).single(), sb.from("payroll_lines").select("*").eq("run_id", runId)]);
  if (run?.status !== "draft") redirect(`${BASE}/${runId}?error=${encodeURIComponent("งวดปิดแล้ว — เปิดแก้ไขก่อน")}`);
  for (const l of (lines ?? []) as PayrollLine[]) {
    const c = computeLine({ ...l, deduct_late: on }, s, null);
    await sb.from("payroll_lines").update(stripId(c)).eq("id", l.id);
  }
  revalidatePath(`${BASE}/${runId}`);
  redirect(`${BASE}/${runId}`);
}

export async function updatePayDate(runId: string, formData: FormData) {
  const { sb } = await requirePayroll(`${BASE}/${runId}`);
  await sb.from("payroll_runs").update({ pay_date: nul(formData.get("pay_date")), note: nul(formData.get("note")) }).eq("id", runId);
  redirect(`${BASE}/${runId}`);
}

export async function deletePayrollRun(runId: string) {
  const { sb } = await requirePayroll(`${BASE}/${runId}`);
  const { data } = await sb.from("payroll_runs").delete().eq("id", runId).eq("status", "draft").select("id");
  if (!data?.length) redirect(`${BASE}/${runId}?error=${encodeURIComponent("ลบได้เฉพาะงวดที่ยังไม่ปิด")}`);
  redirect(`${BASE}?deleted=1`);
}

// ---------------- helpers ----------------
function stripId(l: PayrollLine) { const { id: _a, run_id: _b, employee_id: _c, ...rest } = l; void _a; void _b; void _c; return rest; }
function emptyLine(): PayrollLine {
  return { id: "", run_id: "", employee_id: "", salary: 0, position_allowance: 0, ot_hours_weekday: 0, ot_hours_holiday1: 0, ot_hours_holiday3: 0, hourly_rate: 0, commission_sales: 0, commission_rate: 0, commission_amount: 0, diligence: 0, bonus: 0, other_income: 0, other_income_note: null, late_minutes: 0, deduct_late: true, absent_days: 0, unpaid_leave_days: 0, sso_on: false, tax_method: "pnd1", tax_manual: false, advance: 0, other_deduct: 0, other_deduct_note: null, ot_amount: 0, late_deduct: 0, absence_deduct: 0, earnings: 0, sso_base: 0, sso_employee: 0, sso_employer: 0, tax_wht: 0, total_deduct: 0, net_pay: 0, bank_name: null, bank_account: null, account_name: null, note: null };
}
