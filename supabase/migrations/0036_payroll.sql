-- =====================================================================
-- PKM ERP — 0036: PAYROLL (HR) — เฉพาะผู้บริหาร + รหัสผ่านอีกชั้น
--   ล็อกด้วยรหัสผ่านเดียวใช้ร่วมกัน (เก็บแบบ bcrypt) → ปลดล็อกได้ 30 นาที/ครั้ง · ผิด 5 ครั้ง ล็อก 15 นาที
--   ข้อมูลเงินเดือนอ่าน/แก้ได้เฉพาะ admin ที่ "ปลดล็อกแล้ว" (ตรวจ token ใน header x-payroll-token ทุกคำขอ)
--   พนักงานเห็นสลิปของตัวเองหลังปิดงวดเท่านั้น
--   ประกันสังคม: เริ่มหักงวด ม.ค. 2570 (ตั้งค่าได้) · อัตรา/ฐานสูงสุดตั้งค่าได้ (ตรวจกับสำนักงานบัญชี)
-- =====================================================================

create table if not exists public.payroll_settings (
  id                   int primary key default 1 check (id = 1),
  sso_rate             numeric(5,2) not null default 5,
  sso_min_base         numeric(12,2) not null default 1650,
  sso_max_base         numeric(12,2) not null default 17500,
  sso_start_month      date not null default '2027-01-01',
  days_per_month       numeric(5,2) not null default 30,
  hours_per_day        numeric(5,2) not null default 8,
  ot_weekday_mult      numeric(4,2) not null default 1.5,
  holiday_work_mult    numeric(4,2) not null default 1.0,
  ot_holiday_mult      numeric(4,2) not null default 3.0,
  personal_allowance   numeric(12,2) not null default 60000,
  expense_rate         numeric(5,2) not null default 50,
  expense_cap          numeric(12,2) not null default 100000,
  company_sso_no       text,
  updated_at           timestamptz not null default now()
);
insert into public.payroll_settings (id) values (1) on conflict do nothing;

-- รหัสผ่าน (แยกตาราง ไม่มี policy = อ่านจากหน้าเว็บไม่ได้เลย)
create table if not exists public.payroll_secret (id int primary key default 1 check (id = 1), password_hash text);
insert into public.payroll_secret (id) values (1) on conflict do nothing;

create table if not exists public.payroll_sessions (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists public.payroll_attempts (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  at      timestamptz not null default now(),
  ok      boolean not null
);

create table if not exists public.payroll_profiles (
  employee_id          uuid primary key references public.employees(id) on delete cascade,
  base_salary          numeric(12,2) not null default 0,
  position_allowance   numeric(12,2) not null default 0,
  commission_rate      numeric(6,3) not null default 0,       -- % ของยอดขาย (PC)
  ot_hourly_rate       numeric(10,2),                          -- กำหนดค่าแรง/ชม. สำหรับ OT เอง (ว่าง = เงินเดือน ÷ 30 ÷ 8)
  deduct_late          boolean not null default true,
  sso_enabled          boolean not null default true,
  tax_method           text not null default 'pnd1' check (tax_method in ('pnd1', 'flat3', 'fixed', 'none')),
  tax_fixed            numeric(12,2) not null default 0,
  tax_extra_deduction  numeric(12,2) not null default 0,      -- ลดหย่อนอื่นต่อปี (คู่สมรส บุตร ประกันชีวิต ฯลฯ)
  bank_name            text,
  bank_account         text,
  account_name         text,
  include_in_payroll   boolean not null default true,
  note                 text,
  updated_at           timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id          uuid primary key default gen_random_uuid(),
  period      date not null unique,                          -- วันที่ 1 ของเดือน
  pay_date    date,
  status      text not null default 'draft' check (status in ('draft', 'closed')),
  note        text,
  created_by  uuid references public.app_users(id) default public.current_app_user_id(),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references public.app_users(id)
);

create table if not exists public.payroll_lines (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id        uuid not null references public.employees(id),
  -- inputs
  salary             numeric(12,2) not null default 0,
  position_allowance numeric(12,2) not null default 0,
  ot_hours_weekday   numeric(6,2) not null default 0,
  ot_hours_holiday1  numeric(6,2) not null default 0,         -- ทำงานวันหยุด (1 เท่า)
  ot_hours_holiday3  numeric(6,2) not null default 0,         -- OT วันหยุด (3 เท่า)
  hourly_rate        numeric(10,2) not null default 0,
  commission_sales   numeric(14,2) not null default 0,
  commission_rate    numeric(6,3) not null default 0,
  commission_amount  numeric(12,2) not null default 0,        -- คอมมิชชั่น (คำนวณจากยอดขาย × % หรือกรอกเอง)
  diligence          numeric(12,2) not null default 0,        -- เบี้ยขยัน
  bonus              numeric(12,2) not null default 0,
  other_income       numeric(12,2) not null default 0,
  other_income_note  text,
  late_minutes       int not null default 0,
  absent_days        numeric(5,2) not null default 0,
  unpaid_leave_days  numeric(5,2) not null default 0,
  sso_on             boolean not null default false,
  tax_method         text not null default 'pnd1',
  tax_manual         boolean not null default false,
  advance            numeric(12,2) not null default 0,        -- เบิกล่วงหน้า
  other_deduct       numeric(12,2) not null default 0,
  other_deduct_note  text,
  -- results
  ot_amount          numeric(12,2) not null default 0,
  late_deduct        numeric(12,2) not null default 0,
  absence_deduct     numeric(12,2) not null default 0,
  earnings           numeric(14,2) not null default 0,
  sso_base           numeric(12,2) not null default 0,
  sso_employee       numeric(12,2) not null default 0,
  sso_employer       numeric(12,2) not null default 0,
  tax_wht            numeric(12,2) not null default 0,
  total_deduct       numeric(14,2) not null default 0,
  net_pay            numeric(14,2) not null default 0,
  bank_name          text,
  bank_account       text,
  account_name       text,
  note               text,
  updated_at         timestamptz not null default now(),
  unique (run_id, employee_id)
);

-- ---------------------------------------------------------------------
-- ปลดล็อก
create or replace function public.payroll_unlocked() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (
    select 1 from public.payroll_sessions s
     where s.user_id = public.current_app_user_id() and s.expires_at > now()
       and s.token::text = coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-payroll-token', ''));
$$;

create or replace function public.payroll_has_password() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and (select password_hash is not null from public.payroll_secret where id = 1);
$$;

create or replace function public.payroll_unlock(p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := public.current_app_user_id(); v_hash text; v_fail int; v_token uuid;
begin
  if not public.is_admin() then return jsonb_build_object('error', 'เฉพาะผู้บริหาร'); end if;
  select count(*) into v_fail from public.payroll_attempts where user_id = v_me and not ok and at > now() - interval '15 minutes'
    and at > coalesce((select max(at) from public.payroll_attempts where user_id = v_me and ok), '-infinity');
  if v_fail >= 5 then return jsonb_build_object('error', 'ใส่รหัสผิดเกิน 5 ครั้ง — ลองใหม่อีก 15 นาที'); end if;
  select password_hash into v_hash from public.payroll_secret where id = 1;
  if v_hash is null then return jsonb_build_object('error', 'ยังไม่ได้ตั้งรหัสผ่าน PAYROLL'); end if;
  if crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into public.payroll_attempts (user_id, ok) values (v_me, false);   -- ไม่ raise เพื่อให้บันทึกครั้งที่ผิดไว้
    return jsonb_build_object('error', 'รหัสผ่านไม่ถูกต้อง (เหลือ ' || greatest(0, 4 - v_fail) || ' ครั้ง)');
  end if;
  insert into public.payroll_attempts (user_id, ok) values (v_me, true);
  delete from public.payroll_sessions where user_id = v_me or expires_at < now();
  insert into public.payroll_sessions (user_id, expires_at) values (v_me, now() + interval '30 minutes') returning token into v_token;
  return jsonb_build_object('token', v_token);
end $$;

-- ต่อเวลา 30 นาทีเมื่อยังใช้งานอยู่
create or replace function public.payroll_touch() returns void
language sql security definer set search_path = public as $$
  update public.payroll_sessions set expires_at = now() + interval '30 minutes'
   where user_id = public.current_app_user_id() and expires_at > now()
     and token::text = coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-payroll-token', '');
$$;

create or replace function public.payroll_lock() returns void
language sql security definer set search_path = public as $$ delete from public.payroll_sessions where user_id = public.current_app_user_id(); $$;

-- ตั้งรหัสครั้งแรก (ยังไม่มีรหัส) หรือเปลี่ยนรหัส (ต้องปลดล็อกอยู่ + ใส่รหัสเดิม)
create or replace function public.payroll_set_password(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้บริหาร'; end if;
  if length(coalesce(p_new, '')) < 6 then raise exception 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว'; end if;
  select password_hash into v_hash from public.payroll_secret where id = 1;
  if v_hash is not null and (p_old is null or crypt(p_old, v_hash) <> v_hash) then raise exception 'รหัสผ่านเดิมไม่ถูกต้อง'; end if;
  update public.payroll_secret set password_hash = crypt(p_new, gen_salt('bf', 10)) where id = 1;
  delete from public.payroll_sessions where true;   -- ทุกคนต้องปลดล็อกใหม่ (Supabase บังคับ DELETE ต้องมี WHERE)
end $$;

grant execute on function public.payroll_unlocked(), public.payroll_has_password(), public.payroll_unlock(text), public.payroll_touch(), public.payroll_lock(), public.payroll_set_password(text, text) to authenticated;

-- ---------------------------------------------------------------------
alter table public.payroll_settings enable row level security;
alter table public.payroll_secret   enable row level security;
alter table public.payroll_sessions enable row level security;
alter table public.payroll_attempts enable row level security;
alter table public.payroll_profiles enable row level security;
alter table public.payroll_runs     enable row level security;
alter table public.payroll_lines    enable row level security;

create policy "payroll settings" on public.payroll_settings for all to authenticated using (public.payroll_unlocked()) with check (public.payroll_unlocked());
create policy "payroll profiles" on public.payroll_profiles for all to authenticated using (public.payroll_unlocked()) with check (public.payroll_unlocked());
create policy "payroll runs"     on public.payroll_runs     for all to authenticated using (public.payroll_unlocked()) with check (public.payroll_unlocked());
create policy "payroll lines"    on public.payroll_lines    for all to authenticated using (public.payroll_unlocked()) with check (public.payroll_unlocked());
-- พนักงาน: สลิปของตัวเองหลังปิดงวด (ฟังก์ชัน security definer กัน policy วนกัน)
create or replace function public.payroll_run_closed(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.payroll_runs where id = p_run and status = 'closed'); $$;
create or replace function public.payroll_run_has_me(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.payroll_lines where run_id = p_run and employee_id = public.my_employee_id()); $$;
create policy "payroll runs closed self" on public.payroll_runs for select to authenticated using (status = 'closed' and public.payroll_run_has_me(id));
create policy "payroll lines self" on public.payroll_lines for select to authenticated using (employee_id = public.my_employee_id() and public.payroll_run_closed(run_id));
