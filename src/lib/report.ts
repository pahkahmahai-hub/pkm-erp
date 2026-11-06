import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange } from "@/lib/format";

export interface ReportRow {
  employee_id: string;
  emp_code: string;
  name: string;
  team: string;
  workdays: number;      // วันทำงานในเดือน (หักวันหยุด)
  present: number;       // วันที่มีเช็คอิน
  late: number;          // จำนวนครั้งสาย
  late_minutes: number;
  outside: number;       // เช็คอิน/เอาท์นอกพื้นที่
  leave: Record<string, number>;
  leave_total: number;
  absent: number;        // วันทำงาน - มา - ลา (ที่ผ่านมาแล้ว)
  ot_hours: number;
}

export async function buildMonthlyReport(supabase: SupabaseClient, ym: string): Promise<{ rows: ReportRow[]; leaveTypes: { code: string; name_th: string }[] }> {
  const { from, to } = monthRange(ym);
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const effectiveTo = to < todayStr ? to : todayStr; // นับขาดเฉพาะวันที่ผ่านมาแล้ว

  const [{ data: emps }, { data: att }, { data: leaves }, { data: ots }, { data: lt }, { data: wd }, { data: wdEff }, { data: holidays }, { data: workdaysSetting }] = await Promise.all([
    supabase.from("employees").select("id, emp_code, title, first_name, last_name, nickname, start_date, end_date, status, teams(abbrev)").order("emp_code"),
    supabase.from("attendance").select("*").gte("work_date", from).lte("work_date", to),
    supabase.from("leave_requests").select("*").eq("status", "approved").lte("start_date", to).gte("end_date", from),
    supabase.from("ot_requests").select("*").eq("status", "approved").gte("work_date", from).lte("work_date", to),
    supabase.from("leave_types").select("code, name_th").order("sort_order"),
    supabase.rpc("working_days", { p_from: from, p_to: to }),
    supabase.rpc("working_days", { p_from: from, p_to: effectiveTo }),
    supabase.from("holidays").select("holiday_date").gte("holiday_date", from).lte("holiday_date", to),
    supabase.from("settings").select("value").eq("key", "workdays").single(),
  ]);

  const leaveTypes = (lt ?? []) as { code: string; name_th: string }[];
  const workdaysSet = new Set<number>(((workdaysSetting?.value as number[]) ?? [1, 2, 3, 4, 5]));
  const holidaySet = new Set((holidays ?? []).map((h) => h.holiday_date as string));

  const isWorkday = (d: string) => {
    const dt = new Date(d + "T00:00:00+07:00");
    const dow = ((dt.getUTCDay() + 6) % 7) + 1; // iso 1..7
    return workdaysSet.has(dow) && !holidaySet.has(d);
  };

  type Emp = { id: string; emp_code: string; title: string | null; first_name: string; last_name: string; nickname: string | null; start_date: string | null; end_date: string | null; status: string; teams: { abbrev: string } | null };
  const rows: ReportRow[] = ((emps ?? []) as unknown as Emp[])
    .filter((e) => e.status !== "resigned" || (e.end_date && e.end_date >= from))
    .map((e) => {
      const a = (att ?? []).filter((x) => x.employee_id === e.id);
      const l = (leaves ?? []).filter((x) => x.employee_id === e.id);
      const o = (ots ?? []).filter((x) => x.employee_id === e.id);

      // leave days inside this month (approved), per type
      const leave: Record<string, number> = {};
      let leaveTotal = 0;
      for (const lr of l) {
        if (Number(lr.days) === 0.5) {
          leave[lr.leave_type] = (leave[lr.leave_type] ?? 0) + 0.5;
          leaveTotal += 0.5;
          continue;
        }
        const s = lr.start_date < from ? from : lr.start_date;
        const en = lr.end_date > to ? to : lr.end_date;
        let d = new Date(s + "T00:00:00Z");
        const end = new Date(en + "T00:00:00Z");
        let n = 0;
        while (d <= end) {
          const ds = d.toISOString().slice(0, 10);
          if (isWorkday(ds)) n++;
          d = new Date(d.getTime() + 86400000);
        }
        leave[lr.leave_type] = (leave[lr.leave_type] ?? 0) + n;
        leaveTotal += n;
      }

      const present = a.filter((x) => x.check_in_at).length;
      const workdaysEff = Number(wdEff ?? 0);
      const absent = Math.max(0, workdaysEff - present - leaveTotal);

      return {
        employee_id: e.id,
        emp_code: e.emp_code,
        name: `${e.title ?? ""}${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`,
        team: e.teams?.abbrev ?? "",
        workdays: Number(wd ?? 0),
        present,
        late: a.filter((x) => x.is_late).length,
        late_minutes: a.reduce((s, x) => s + (x.late_minutes ?? 0), 0),
        outside: a.filter((x) => x.check_in_in_range === false || x.check_out_in_range === false).length,
        leave,
        leave_total: leaveTotal,
        absent,
        ot_hours: o.reduce((s, x) => s + Number(x.hours_approved ?? x.hours_requested), 0),
      };
    });

  return { rows, leaveTypes };
}
