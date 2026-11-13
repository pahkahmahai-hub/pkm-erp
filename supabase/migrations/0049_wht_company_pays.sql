-- 0049: บริษัทออกภาษีหัก ณ ที่จ่ายให้ผู้รับเงิน
--   wht_payer: 1 = หัก ณ ที่จ่าย (หักจากผู้รับเงิน) · 2 = ออกให้ตลอดไป · 3 = ออกให้ครั้งเดียว
--   ภาษี (r = อัตรา):  1 → ฐาน × r   ·  3 → ฐาน × r × (1 + r)   ·  2 → ฐาน × r ÷ (1 − r)
--   กรณี 2/3 ผู้รับเงินได้เต็มจำนวน (ไม่หักจากยอดโอน) — บริษัทนำส่งภาษีเอง
--   50 ทวิ: ตลอดไป เงินได้ = ฐาน + ภาษี · ครั้งเดียว เงินได้ = ฐาน + ภาษีรอบแรก (ฐาน × r) · ช่อง "ผู้จ่ายเงิน" = (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว
alter table public.expenses add column if not exists wht_payer smallint not null default 1 check (wht_payer in (1, 2, 3));

create or replace function public.recalc_expense(p_id uuid) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; v_sub numeric; v_after numeric; v_net numeric; v_vat numeric; v_grand numeric; v_wht numeric; r numeric;
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
  r := coalesce(e.wht_pct, 0) / 100;
  v_wht := case coalesce(e.wht_payer, 1)
             when 2 then round(v_net * r / nullif(1 - r, 0), 2)
             when 3 then round(v_net * r * (1 + r), 2)
             else round(v_net * r, 2) end;
  update public.expenses set subtotal = v_sub, net_before_vat = v_net, vat_amount = v_vat, grand_total = v_grand, wht_amount = coalesce(v_wht, 0),
         net_pay = v_grand - (case when coalesce(e.wht_payer, 1) = 1 then coalesce(v_wht, 0) else 0 end) - coalesce(e.deposit_amount, 0), updated_at = now()
   where id = p_id returning * into e;
  return e;
end $$;

create or replace function public.set_expense_wht_payer(p_id uuid, p_payer int) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if not (public.is_admin() or (e.created_by = public.current_app_user_id() and e.status in ('draft', 'pending', 'rejected'))) then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.expenses set wht_payer = coalesce(p_payer, 1) where id = p_id;
  return public.recalc_expense(p_id);
end $$;
grant execute on function public.set_expense_wht_payer(uuid, int) to authenticated;

-- บิลส่วนที่เหลือ (แยกมัดจำ) ใช้เงื่อนไขผู้ออกภาษีเดียวกับบิลแม่
create or replace function public.expense_inherit_wht_payer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_expense_id is not null then
    select wht_payer into new.wht_payer from public.expenses where id = new.parent_expense_id;
    new.wht_payer := coalesce(new.wht_payer, 1);
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_inherit_wht_payer on public.expenses;
create trigger trg_expense_inherit_wht_payer before insert on public.expenses for each row execute function public.expense_inherit_wht_payer();

-- 50 ทวิ ที่ออกอัตโนมัติจากบิล (ตอนกดจ่าย) → ปรับเงินได้ + เงื่อนไขผู้จ่ายตามบิล
create or replace function public.wht_cert_from_expense_payer() returns trigger
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if new.expense_id is null then return new; end if;
  select * into e from public.expenses where id = new.expense_id;
  if e.id is not null and coalesce(e.wht_payer, 1) in (2, 3) and coalesce(new.payer_condition, 1) = 1 and new.income_amount = e.net_before_vat then
    new.payer_condition := e.wht_payer;
    -- ตลอดไป: เงินได้ = ฐาน + ภาษี (ภาษี = 3% ของเงินได้พอดี) · ครั้งเดียว: เงินได้ = ฐาน + ภาษีรอบแรก (ฐาน × r)
    new.income_amount := case when e.wht_payer = 2 then e.net_before_vat + e.wht_amount else round(e.net_before_vat * (1 + coalesce(e.wht_pct, 0) / 100), 2) end;
  end if;
  return new;
end $$;
drop trigger if exists trg_wht_cert_from_expense_payer on public.wht_certificates;
create trigger trg_wht_cert_from_expense_payer before insert on public.wht_certificates for each row execute function public.wht_cert_from_expense_payer();

