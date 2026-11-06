import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, todayBkk } from "@/lib/format";
import { CheckinPanel } from "./CheckinPanel";
import type { Attendance } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const session = await getSession();
  const supabase = await createClient();
  const today = todayBkk();

  if (!session.employee) {
    return (
      <div className="space-y-6">
        <Header title="เช็คอิน / เช็คเอาท์" />
        <div className="card p-6 text-sm text-ink-soft">บัญชีผู้ดูแลที่ไม่ได้ผูกกับพนักงานไม่ต้องเช็คอิน</div>
      </div>
    );
  }

  const [{ data: att }, { data: office }, { data: hours }, { data: grace }] = await Promise.all([
    supabase.from("attendance").select("*").eq("employee_id", session.employee.id).eq("work_date", today).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "office_location").single(),
    supabase.from("settings").select("value").eq("key", "work_hours").single(),
    supabase.from("settings").select("value").eq("key", "late_grace_minutes").single(),
  ]);

  return (
    <div className="space-y-6">
      <Header title="เช็คอิน / เช็คเอาท์" sub={fmtDate(today, { weekday: "long" })} />
      <CheckinPanel
        initial={(att as Attendance | null) ?? null}
        office={office?.value as { name: string; lat: number; lng: number; radius_m: number }}
        hours={hours?.value as { start: string; end: string }}
        graceMin={Number(grace?.value ?? 0)}
      />
    </div>
  );
}
