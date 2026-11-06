import type { Employee, Team } from "@/lib/types";

export function EmployeeForm({ employee, teams, isAdmin }: { employee?: Employee | null; teams: Team[]; isAdmin: boolean }) {
  const e = employee;
  const ro = !isAdmin; // staff editing own record
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {isAdmin && (
        <Field label="รหัสพนักงาน" hint={e ? undefined : "เว้นว่าง = ระบบออกให้อัตโนมัติ (PKM-ปีทีมลำดับ)"}>
          <input name="emp_code" defaultValue={e?.emp_code ?? ""} className="input font-mono" placeholder="PKM-690104" />
        </Field>
      )}
      {isAdmin && (
        <Field label="ทีม">
          <select name="team_id" defaultValue={e?.team_id ?? teams[0]?.id} className="input" required>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.abbrev} — {t.name_th} (รหัส {t.code})</option>)}
          </select>
        </Field>
      )}
      {isAdmin && (
        <Field label="คำนำหน้า">
          <select name="title" defaultValue={e?.title ?? ""} className="input">
            <option value="">—</option><option>นาย</option><option>นาง</option><option>นางสาว</option>
          </select>
        </Field>
      )}
      {isAdmin ? (
        <>
          <Field label="ชื่อ"><input name="first_name" defaultValue={e?.first_name ?? ""} className="input" required /></Field>
          <Field label="นามสกุล"><input name="last_name" defaultValue={e?.last_name ?? ""} className="input" required /></Field>
        </>
      ) : (
        <Field label="ชื่อ-นามสกุล"><input value={`${e?.title ?? ""}${e?.first_name} ${e?.last_name}`} className="input bg-cream" readOnly /></Field>
      )}
      <Field label="ชื่อเล่น"><input name="nickname" defaultValue={e?.nickname ?? ""} className="input" /></Field>
      {isAdmin && <Field label="ตำแหน่ง"><input name="position" defaultValue={e?.position ?? ""} className="input" /></Field>}
      {isAdmin ? (
        <Field label="อีเมล (ใช้ล็อกอิน)"><input name="email" type="email" defaultValue={e?.email ?? ""} className="input" /></Field>
      ) : (
        <Field label="อีเมล"><input value={e?.email ?? ""} className="input bg-cream" readOnly /></Field>
      )}
      <Field label="โทรศัพท์"><input name="phone" defaultValue={e?.phone ?? ""} className="input" /></Field>
      {isAdmin && <Field label="วันเกิด"><input name="birth_date" type="date" defaultValue={e?.birth_date ?? ""} className="input" /></Field>}
      <div className="md:col-span-2">
        <Field label="ที่อยู่"><textarea name="address" defaultValue={e?.address ?? ""} className="input" rows={2} /></Field>
      </div>
      {isAdmin && (
        <>
          <Field label="วันเริ่มงาน"><input name="start_date" type="date" defaultValue={e?.start_date ?? ""} className="input" /></Field>
          <Field label="วันสิ้นสุด (ถ้าลาออก)"><input name="end_date" type="date" defaultValue={e?.end_date ?? ""} className="input" /></Field>
          <Field label="สถานะ">
            <select name="status" defaultValue={e?.status ?? "probation"} className="input">
              <option value="probation">ทดลองงาน</option>
              <option value="active">พนักงานประจำ</option>
              <option value="resigned">ลาออกแล้ว</option>
            </select>
          </Field>
          <Field label="ต้องตรวจข้อมูล">
            <label className="flex items-center gap-2 text-sm py-2.5">
              <input type="checkbox" name="needs_review" defaultChecked={e?.needs_review ?? false} className="accent-purple" /> ยังมีข้อมูลที่ไม่แน่ใจ/ไม่ครบ
            </label>
          </Field>
          <div className="md:col-span-2">
            <Field label="หมายเหตุการตรวจ"><input name="review_note" defaultValue={e?.review_note ?? ""} className="input" /></Field>
          </div>
          <div className="md:col-span-2">
            <Field label="บันทึกภายใน (admin เท่านั้น)"><textarea name="notes" defaultValue={e?.notes ?? ""} className="input" rows={2} /></Field>
          </div>
          {!e && (
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="create_login" defaultChecked className="accent-purple" /> สร้างบัญชีเข้าระบบให้ด้วย (ใช้อีเมลด้านบน)
              </label>
            </div>
          )}
        </>
      )}
      {ro && <p className="md:col-span-2 text-xs text-ink-soft">แก้ได้เฉพาะชื่อเล่น โทรศัพท์ และที่อยู่ — ข้อมูลอื่นติดต่อผู้ดูแล</p>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-soft mt-1">{hint}</p>}
    </div>
  );
}
