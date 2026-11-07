-- =====================================================================
-- PKM ERP — 0010: หนังสือรับรองหัก ณ ที่จ่าย แบบ FlowAccount
--   • เลขที่ WT + YYYYMM + 4 หลัก (ต่อบริษัท ต่อเดือน) เช่น WT2026090043
--   • ออกใบเดี่ยวได้โดยไม่ต้องผ่านบิลค่าใช้จ่าย (create_wht_cert)
--   • เก็บข้อ (1-6) และคำอธิบายประเภทเงินได้ตามฟอร์มสรรพากร + เงื่อนไขผู้จ่าย (1)-(4)
-- =====================================================================

alter table public.wht_certificates add column if not exists income_row smallint not null default 5;     -- ข้อ 1-6 บนฟอร์ม
alter table public.wht_certificates add column if not exists payer_condition smallint not null default 1; -- (1) หัก ณ ที่จ่าย (2) ออกให้ตลอดไป (3) ออกให้ครั้งเดียว (4) อื่นๆ
alter table public.wht_certificates add column if not exists note text;
alter table public.wht_certificates add column if not exists payee_branch text;

create or replace function public.next_wht_no(p_company uuid, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(p_date, 'YYYYMM'); v_no int;
begin
  insert into public.expense_counters (company_id, kind, period, last_no) values (p_company, 'WT', v_period, 1)
  on conflict (company_id, kind, period) do update set last_no = public.expense_counters.last_no + 1
  returning last_no into v_no;
  return 'WT' || v_period || lpad(v_no::text, 4, '0');
end $$;

-- ออกใบเดี่ยว (admin หรือทีม SW) — ไม่ผูกกับบิล หรือผูกกับบิลที่ยังไม่มีใบก็ได้
create or replace function public.create_wht_cert(
  p_company uuid, p_form public.wht_form, p_payee_name text, p_payee_tax_id text, p_payee_address text, p_payee_branch text,
  p_pay_date date, p_income_row int, p_income_type text, p_income_amount numeric, p_wht_pct numeric, p_wht_amount numeric,
  p_payer_condition int, p_note text, p_expense uuid default null
) returns public.wht_certificates
language plpgsql security definer set search_path = public as $$
declare w public.wht_certificates;
begin
  if not public.can_expense() then raise exception 'ไม่มีสิทธิ์ออกหนังสือรับรองหัก ณ ที่จ่าย'; end if;
  if p_expense is not null and exists (select 1 from public.wht_certificates where expense_id = p_expense) then raise exception 'บิลนี้มีหนังสือรับรองแล้ว'; end if;
  insert into public.wht_certificates (company_id, cert_no, expense_id, form, payee_name, payee_tax_id, payee_address, payee_branch, pay_date, income_row, income_type, income_amount, wht_pct, wht_amount, payer_condition, note, created_by)
  values (p_company, public.next_wht_no(p_company, p_pay_date), p_expense, p_form, p_payee_name, p_payee_tax_id, p_payee_address, p_payee_branch, p_pay_date, coalesce(p_income_row, 5), p_income_type,
          p_income_amount, p_wht_pct, coalesce(p_wht_amount, round(p_income_amount * p_wht_pct / 100, 2)), coalesce(p_payer_condition, 1), p_note, public.current_app_user_id())
  returning * into w;
  return w;
end $$;

create or replace function public.delete_wht_cert(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ลบได้เฉพาะผู้บริหาร'; end if;
  delete from public.wht_certificates where id = p_id;
end $$;
