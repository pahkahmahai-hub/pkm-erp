-- =====================================================================
-- PKM ERP — 0045: มัดจำในบิลค่าใช้จ่าย
--   ยอดจ่ายจริง = ยอดตามบิล − หัก ณ ที่จ่าย − มัดจำที่จ่ายไปแล้ว
--   (ภาษีหัก ณ ที่จ่ายยังคิดจากยอดเต็มของบิล)
-- =====================================================================
alter table public.expenses add column if not exists deposit_amount numeric(14,2) not null default 0;
alter table public.expenses add column if not exists deposit_note text;

create or replace function public.recalc_expense(p_id uuid) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; v_sub numeric; v_after numeric; v_net numeric; v_vat numeric; v_grand numeric; v_wht numeric;
begin
  select * into e from public.expenses where id = p_id;
  update public.expense_items set amount = round(qty * unit_price - coalesce(discount, 0), 2) where expense_id = p_id;
  select coalesce(sum(amount), 0) into v_sub from public.expense_items where expense_id = p_id;
  v_after := v_sub - coalesce(e.discount_amount, 0);
  if e.vat_mode = 'inclusive' then
    v_grand := v_after; v_net := round(v_after * 100 / (100 + e.vat_rate), 2); v_vat := v_grand - v_net;
  elsif e.vat_mode = 'exclusive' then
    v_net := v_after; v_vat := round(v_after * e.vat_rate / 100, 2); v_grand := v_net + v_vat;
  else
    v_net := v_after; v_vat := 0; v_grand := v_after;
  end if;
  v_wht := round(v_net * coalesce(e.wht_pct, 0) / 100, 2);
  update public.expenses set subtotal = v_sub, net_before_vat = v_net, vat_amount = v_vat, grand_total = v_grand, wht_amount = v_wht,
         net_pay = v_grand - v_wht - coalesce(e.deposit_amount, 0), updated_at = now()
   where id = p_id returning * into e;
  return e;
end $$;

create or replace function public.set_expense_deposit(p_id uuid, p_amount numeric, p_note text) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.expenses set deposit_amount = greatest(coalesce(p_amount, 0), 0), deposit_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  return public.recalc_expense(p_id);
end $$;
grant execute on function public.set_expense_deposit(uuid, numeric, text) to authenticated;
