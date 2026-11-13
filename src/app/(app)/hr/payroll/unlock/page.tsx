import { redirect } from "next/navigation";
import { Lock, KeyRound } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { unlockPayroll, setPayrollPassword } from "../actions";

export const dynamic = "force-dynamic";

export default async function PayrollUnlock({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; msg?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session.isAdmin) redirect("/hr");
  const supabase = await createClient();
  const { data: hasPw } = await supabase.rpc("payroll_has_password");
  return (
    <div className="max-w-md mx-auto space-y-4 pt-6">
      <Header crumbs={[{ href: "/hr", label: "HR" }]} title="PAYROLL" sub="ข้อมูลเงินเดือนเป็นความลับ — ต้องใส่รหัสผ่านอีกชั้น" />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {sp.msg && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">{sp.msg}</div>}
      {hasPw ? (
        <form action={unlockPayroll} className="card p-6 space-y-4">
          <div className="flex items-center gap-2 font-display font-bold text-lg"><Lock size={18} className="text-purple" /> ใส่รหัสผ่าน PAYROLL</div>
          <input type="hidden" name="next" value={sp.next ?? "/hr/payroll"} />
          <input type="password" name="password" className="input text-lg tracking-widest" autoFocus required autoComplete="off" />
          <button className="btn-primary w-full">เข้า PAYROLL</button>
          <p className="text-[11px] text-ink-soft">ปลดล็อกแล้วใช้งานได้ต่อเนื่อง · ไม่มีการใช้งาน 30 นาทีจะล็อกเอง · ใส่ผิด 5 ครั้งล็อก 15 นาที</p>
        </form>
      ) : (
        <form action={setPayrollPassword} className="card p-6 space-y-4">
          <div className="flex items-center gap-2 font-display font-bold text-lg"><KeyRound size={18} className="text-purple" /> ตั้งรหัสผ่าน PAYROLL ครั้งแรก</div>
          <p className="text-sm text-ink-soft">รหัสนี้ใช้ร่วมกันระหว่างคุณกับภรรยา (อย่างน้อย 6 ตัว) — ระบบเก็บแบบเข้ารหัส ไม่มีใครเห็นรหัสจริง</p>
          <input type="hidden" name="back" value="/hr/payroll/unlock" />
          <div><label className="label">รหัสผ่านใหม่</label><input type="password" name="new_password" minLength={6} className="input" required autoComplete="new-password" /></div>
          <div><label className="label">ยืนยันรหัสผ่าน</label><input type="password" name="confirm" minLength={6} className="input" required autoComplete="new-password" /></div>
          <button className="btn-primary w-full">ตั้งรหัสผ่าน</button>
        </form>
      )}
    </div>
  );
}
