-- PKM ERP — 0038: ปุ่มเปิด/ปิด การหักขาดงาน (รายคนต่องวด + ทั้งงวด) — เหมือนหักสาย
alter table public.payroll_lines add column if not exists deduct_absence boolean not null default true;
