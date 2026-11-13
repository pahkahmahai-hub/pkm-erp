-- PKM ERP — 0037: ปุ่มเปิด/ปิด การหักสาย (รายคนต่องวด + ทั้งงวด)
alter table public.payroll_lines add column if not exists deduct_late boolean not null default true;
-- งวดที่มีอยู่แล้ว: ใช้ค่าตามข้อมูลพนักงาน
update public.payroll_lines l set deduct_late = p.deduct_late from public.payroll_profiles p where p.employee_id = l.employee_id;
