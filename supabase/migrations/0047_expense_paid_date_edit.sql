-- 0047: แก้ไขวันที่จ่ายเงินของบิลที่จ่ายแล้ว (ผู้บริหารเท่านั้น)
-- ถ้ามีหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ผูกกับบิล จะเลื่อนวันที่จ่ายในใบให้ตรงกันด้วย
create or replace function public.set_expense_paid_date(p_id uuid, p_date date, p_method text default null, p_ref text default null, p_sync_wht boolean default true)
returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้บริหารแก้วันที่จ่ายได้'; end if;
  if p_date is null then raise exception 'กรุณาระบุวันที่จ่าย'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status <> 'paid' then raise exception 'บิลนี้ยังไม่ได้จ่าย'; end if;
  update public.expenses set paid_date = p_date, paid_method = coalesce(nullif(p_method, ''), paid_method), paid_ref = case when p_ref is null then paid_ref else nullif(p_ref, '') end, updated_at = now()
   where id = p_id returning * into e;
  if coalesce(p_sync_wht, true) then
    update public.wht_certificates set pay_date = p_date where expense_id = p_id;
  end if;
  return e;
end $$;
grant execute on function public.set_expense_paid_date(uuid, date, text, text, boolean) to authenticated;
