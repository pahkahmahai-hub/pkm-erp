-- =====================================================================
-- PKM ERP — 0039: หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) จาก PAYROLL
--   • รายเดือน: ปุ่มในงวด → ออกใบให้ทุกคนที่ถูกหักภาษีเดือนนั้น (ภ.ง.ด.1 / 3% = ภ.ง.ด.3)
--   • สรุปทั้งปี: ปุ่มในหน้า PAYROLL → 1 ใบ/คน/ปี (ภ.ง.ด.1ก) รวมทุกงวดที่ปิดแล้ว · กดซ้ำ = อัปเดตยอด (เลขเดิม)
--   • ใบจาก PAYROLL เห็นได้เฉพาะผู้บริหาร (ไม่ผูกบิลค่าใช้จ่าย)
--   • ไม่เก็บเลขบัตรประชาชน → ช่องเลขผู้เสียภาษีของพนักงานเว้นว่างไว้ให้เขียนเอง
-- =====================================================================
alter type public.wht_form add value if not exists 'pnd1';
alter type public.wht_form add value if not exists 'pnd1a';

alter table public.wht_certificates add column if not exists payroll_line_id uuid unique references public.payroll_lines(id) on delete set null;
alter table public.wht_certificates add column if not exists payroll_employee_id uuid references public.employees(id);
alter table public.wht_certificates add column if not exists payroll_year int;
alter table public.wht_certificates add column if not exists sso_amount numeric(14,2);
create unique index if not exists wht_payroll_annual on public.wht_certificates (payroll_employee_id, payroll_year) where payroll_year is not null;

create or replace function public.payroll_payee(p_emp uuid) returns table (name text, address text)
language sql stable security definer set search_path = public as $$
  select trim(coalesce(title, '') || first_name || ' ' || last_name), address from public.employees where id = p_emp;
$$;

-- ออกใบรายเดือนของงวด (ข้ามคนที่มีใบแล้ว) — คืนจำนวนใบที่ออกใหม่
create or replace function public.create_payroll_wht(p_run uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r public.payroll_runs; l record; v_co uuid; v_pay date; n int := 0; p record;
begin
  if not public.payroll_unlocked() then raise exception 'ต้องปลดล็อก PAYROLL ก่อน'; end if;
  select * into r from public.payroll_runs where id = p_run;
  if r.id is null then raise exception 'ไม่พบงวด'; end if;
  select id into v_co from public.companies where code = 'PKM';
  v_pay := coalesce(r.pay_date, (r.period + interval '1 month - 1 day')::date);
  for l in select * from public.payroll_lines where run_id = p_run and tax_wht > 0
             and not exists (select 1 from public.wht_certificates w where w.payroll_line_id = payroll_lines.id) loop
    select * into p from public.payroll_payee(l.employee_id);
    insert into public.wht_certificates (company_id, cert_no, form, payee_name, payee_address, pay_date, income_row, income_type, income_amount, wht_pct, wht_amount,
                                         payer_condition, note, created_by, payroll_line_id, payroll_employee_id, sso_amount)
    values (v_co, public.next_wht_no(v_co, v_pay),
            (case when l.tax_method = 'flat3' then 'pnd3' else 'pnd1' end)::public.wht_form, p.name, p.address, v_pay,
            case when l.tax_method = 'flat3' then 2 else 1 end,
            case when l.tax_method = 'flat3' then 'ค่านายหน้า/คอมมิชชั่น' else 'เงินเดือน ค่าจ้าง' end,
            greatest(0, l.earnings - l.late_deduct - l.absence_deduct),
            case when l.tax_method = 'flat3' then 3 else round(l.tax_wht * 100 / nullif(greatest(0, l.earnings - l.late_deduct - l.absence_deduct), 0), 2) end,
            l.tax_wht, 1, 'PAYROLL งวด ' || to_char(r.period, 'MM/YYYY'), public.current_app_user_id(), l.id, l.employee_id, nullif(l.sso_employee, 0));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ใบสรุปทั้งปี (ภ.ง.ด.1ก) — รวมงวดที่ปิดแล้วของปี ค.ศ. p_year · ออกใหม่หรืออัปเดตยอด
create or replace function public.create_payroll_wht_annual(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare v_co uuid; e record; p record; n int := 0; v_pay date := make_date(p_year, 12, 31); v_id uuid;
begin
  if not public.payroll_unlocked() then raise exception 'ต้องปลดล็อก PAYROLL ก่อน'; end if;
  select id into v_co from public.companies where code = 'PKM';
  for e in
    select l.employee_id, sum(greatest(0, l.earnings - l.late_deduct - l.absence_deduct)) inc, sum(l.tax_wht) tax, sum(l.sso_employee) sso, max(coalesce(r.pay_date, r.period)) last_pay
      from public.payroll_lines l join public.payroll_runs r on r.id = l.run_id
     where r.status = 'closed' and extract(year from r.period) = p_year and l.tax_method <> 'flat3'
     group by l.employee_id having sum(l.earnings) > 0
  loop
    select * into p from public.payroll_payee(e.employee_id);
    select id into v_id from public.wht_certificates where payroll_employee_id = e.employee_id and payroll_year = p_year;
    if v_id is null then
      insert into public.wht_certificates (company_id, cert_no, form, payee_name, payee_address, pay_date, income_row, income_type, income_amount, wht_pct, wht_amount,
                                           payer_condition, note, created_by, payroll_employee_id, payroll_year, sso_amount)
      values (v_co, public.next_wht_no(v_co, least(v_pay, (now() at time zone 'Asia/Bangkok')::date)), 'pnd1a'::public.wht_form, p.name, p.address, least(v_pay, greatest(e.last_pay, make_date(p_year, 1, 1))),
              1, 'เงินเดือน ค่าจ้าง ทั้งปี ' || (p_year + 543), e.inc, round(e.tax * 100 / nullif(e.inc, 0), 2), e.tax, 1, 'สรุปทั้งปี ' || (p_year + 543) || ' (ภ.ง.ด.1ก)', public.current_app_user_id(),
              e.employee_id, p_year, nullif(e.sso, 0));
    else
      update public.wht_certificates set payee_name = p.name, payee_address = p.address, income_amount = e.inc, wht_amount = e.tax,
        wht_pct = round(e.tax * 100 / nullif(e.inc, 0), 2), sso_amount = nullif(e.sso, 0) where id = v_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.create_payroll_wht(uuid), public.create_payroll_wht_annual(int) to authenticated;
