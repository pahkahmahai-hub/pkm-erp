import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DEFAULT_SETTINGS, type PayrollSettings } from "./calc";

export const PAYROLL_COOKIE = "pkm_payroll";

/** Supabase client ที่แนบ token ปลดล็อก PAYROLL ไปใน header ทุกคำขอ (RLS ตรวจ token นี้) */
export async function payrollClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PAYROLL_COOKIE)?.value ?? "";
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* server component */ } },
    },
    global: { headers: { "x-payroll-token": token } },
  });
}

/** หน้า PAYROLL: ต้องเป็นผู้บริหาร และปลดล็อกแล้ว (ไม่งั้นพาไปหน้าใส่รหัส) */
export async function requirePayroll(next = "/hr/payroll") {
  const session = await getSession();
  if (!session.isAdmin) redirect("/hr?denied=1");
  const sb = await payrollClient();
  const { data: ok } = await sb.rpc("payroll_unlocked");
  if (!ok) redirect(`/hr/payroll/unlock?next=${encodeURIComponent(next)}`);
  await sb.rpc("payroll_touch");   // ใช้งานอยู่ → ต่อเวลา 30 นาที
  return { session, sb };
}

export async function loadPayrollSettings(sb: Awaited<ReturnType<typeof payrollClient>>): Promise<PayrollSettings> {
  const { data } = await sb.from("payroll_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  const d = data as Record<string, unknown>;
  const num = (k: keyof PayrollSettings) => Number(d[k] ?? DEFAULT_SETTINGS[k]);
  return {
    sso_rate: num("sso_rate"), sso_min_base: num("sso_min_base"), sso_max_base: num("sso_max_base"), sso_start_month: String(d.sso_start_month ?? DEFAULT_SETTINGS.sso_start_month),
    days_per_month: num("days_per_month"), hours_per_day: num("hours_per_day"), ot_weekday_mult: num("ot_weekday_mult"), holiday_work_mult: num("holiday_work_mult"), ot_holiday_mult: num("ot_holiday_mult"),
    personal_allowance: num("personal_allowance"), expense_rate: num("expense_rate"), expense_cap: num("expense_cap"), company_sso_no: (d.company_sso_no as string) ?? null,
  };
}
