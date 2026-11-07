-- =====================================================================
-- PKM ERP — 0008: ส่วนลด/GP ประจำลูกค้า (เติมอัตโนมัติในเอกสารขาย)
-- =====================================================================
alter table public.contacts add column if not exists default_discount_pct numeric(6,2) not null default 0;
alter table public.contacts add column if not exists default_vat_mode public.vat_mode;      -- null = ตามค่าเริ่มต้นระบบ
alter table public.contacts add column if not exists default_channel public.sales_channel;  -- เช่น store สำหรับห้าง
comment on column public.contacts.default_discount_pct is 'GP / ส่วนลดท้ายบิล % ที่ใช้กับลูกค้ารายนี้เป็นประจำ';
