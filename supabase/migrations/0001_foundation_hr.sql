-- =====================================================================
-- PKM ERP — Foundation (users / roles / teams) + HR module
-- บริษัท ปากาม้า (ไทยแลนด์) จำกัด
-- Run this once in Supabase SQL Editor (or via supabase db push).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Foundation
-- ---------------------------------------------------------------------
create type public.user_role as enum ('admin', 'staff');
create type public.employee_status as enum ('probation', 'active', 'resigned');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.teams (
  id          serial primary key,
  code        char(2) not null unique,          -- used in employee code: 01 = SW, 02 = GC
  abbrev      text not null unique,             -- SW / GC
  name_th     text not null,
  name_en     text not null,
  created_at  timestamptz not null default now()
);

create table public.employees (
  id            uuid primary key default gen_random_uuid(),
  emp_code      text not null unique,           -- PKM-YYTTNN (YY = พ.ศ. 2 หลัก, TT = team code, NN = ลำดับ)
  title         text,                           -- นาย / นาง / นางสาว
  first_name    text not null,
  last_name     text not null,
  nickname      text,
  team_id       int references public.teams(id),
  position      text,
  email         text unique,                    -- Gmail used for login
  phone         text,
  birth_date    date,
  address       text,
  start_date    date,
  end_date      date,
  status        public.employee_status not null default 'active',
  needs_review  boolean not null default false, -- ข้อมูลยังไม่ครบ/ไม่แน่ใจ ให้ admin ตรวจ
  review_note   text,
  photo_url     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- บัญชีเข้าระบบ แยกจาก "คน" — allowlist ด้วยอีเมล
create table public.app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  role          public.user_role not null default 'staff',
  employee_id   uuid unique references public.employees(id) on delete set null,
  auth_user_id  uuid unique,                    -- filled automatically on first Google sign-in
  is_active     boolean not null default true,
  display_name  text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- key/value settings used by every module
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. HR module
-- ---------------------------------------------------------------------
create table public.leave_types (
  code            text primary key,             -- sick / personal / annual
  name_th         text not null,
  quota_days      numeric(5,1) not null,        -- ต่อปี
  requires_doc    boolean not null default false,
  sort_order      int not null default 0
);

create table public.holidays (
  holiday_date  date primary key,
  name          text not null
);

create table public.attendance (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references public.employees(id) on delete cascade,
  work_date             date not null,
  check_in_at           timestamptz,
  check_in_lat          double precision,
  check_in_lng          double precision,
  check_in_distance_m   numeric(8,1),
  check_in_in_range     boolean,
  check_out_at          timestamptz,
  check_out_lat         double precision,
  check_out_lng         double precision,
  check_out_distance_m  numeric(8,1),
  check_out_in_range    boolean,
  is_late               boolean not null default false,
  late_minutes          int not null default 0,
  note                  text,
  admin_note            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type    text not null references public.leave_types(code),
  start_date    date not null,
  end_date      date not null,
  days          numeric(5,1) not null,          -- นับเฉพาะวันทำงาน, 0.5 ได้
  reason        text,
  status        public.request_status not null default 'pending',
  reviewed_by   uuid references public.app_users(id),
  reviewed_at   timestamptz,
  admin_note    text,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.ot_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  work_date       date not null,
  start_time      time not null,
  end_time        time not null,
  hours_requested numeric(4,1) not null,
  reason          text,
  status          public.request_status not null default 'pending',
  hours_approved  numeric(4,1),                 -- admin แก้ชั่วโมงที่อนุมัติได้
  reviewed_by     uuid references public.app_users(id),
  reviewed_at     timestamptz,
  admin_note      text,
  created_at      timestamptz not null default now()
);

create index on public.attendance (work_date);
create index on public.leave_requests (employee_id, start_date);
create index on public.ot_requests (employee_id, work_date);

-- ---------------------------------------------------------------------
-- 3. Helper functions
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger employees_updated  before update on public.employees  for each row execute function public.set_updated_at();
create trigger attendance_updated before update on public.attendance for each row execute function public.set_updated_at();
create trigger settings_updated   before update on public.settings   for each row execute function public.set_updated_at();

-- current app user / role (used by RLS)
create or replace function public.current_app_user() returns public.app_users
language sql stable security definer set search_path = public as $$
  select * from public.app_users where auth_user_id = auth.uid() and is_active limit 1;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.app_users where auth_user_id = auth.uid() and is_active), false);
$$;

create or replace function public.my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.app_users where auth_user_id = auth.uid() and is_active;
$$;

-- link Google sign-in to the allowlisted app_user (by email)
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.app_users
     set auth_user_id = new.id,
         last_login_at = now(),
         display_name = coalesce(display_name, new.raw_user_meta_data->>'full_name')
   where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- employee code generator: PKM-<พ.ศ. yy><team code><running no.>
create or replace function public.next_employee_code(p_team_id int, p_start_date date)
returns text language plpgsql as $$
declare
  v_team  char(2);
  v_yy    text;
  v_prefix text;
  v_n     int;
begin
  select code into v_team from public.teams where id = p_team_id;
  if v_team is null then raise exception 'team not found'; end if;
  v_yy := to_char((extract(year from coalesce(p_start_date, current_date))::int + 543) % 100, 'FM00');
  v_prefix := 'PKM-' || v_yy || v_team;
  select coalesce(max(substring(emp_code from 9 for 2)::int), 0) + 1 into v_n
    from public.employees where emp_code like v_prefix || '%';
  return v_prefix || to_char(v_n, 'FM00');
end $$;

-- distance in metres between two lat/lng (haversine)
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- count working days between two dates (excludes weekends + holidays)
create or replace function public.working_days(p_from date, p_to date)
returns int language sql stable as $$
  select count(*)::int
    from generate_series(p_from, p_to, interval '1 day') d
   where extract(isodow from d) in (select jsonb_array_elements_text(value)::int from public.settings where key = 'workdays')
     and d::date not in (select holiday_date from public.holidays);
$$;

-- ---------------------------------------------------------------------
-- 4. Check-in / check-out RPC (does the GPS + late logic server-side)
-- ---------------------------------------------------------------------
create or replace function public.do_check(p_kind text, p_lat double precision, p_lng double precision, p_note text default null)
returns public.attendance
language plpgsql security definer set search_path = public as $$
declare
  v_emp       uuid := public.my_employee_id();
  v_office    jsonb;
  v_radius    double precision;
  v_dist      double precision;
  v_in_range  boolean;
  v_today     date := (now() at time zone 'Asia/Bangkok')::date;
  v_now_local time := (now() at time zone 'Asia/Bangkok')::time;
  v_start     time;
  v_grace     int;
  v_late      boolean := false;
  v_late_min  int := 0;
  v_row       public.attendance;
begin
  if v_emp is null then raise exception 'ไม่พบข้อมูลพนักงานของบัญชีนี้'; end if;

  select value into v_office from public.settings where key = 'office_location';
  v_radius := coalesce((v_office->>'radius_m')::double precision, 200);
  v_dist := public.distance_m(p_lat, p_lng, (v_office->>'lat')::double precision, (v_office->>'lng')::double precision);
  v_in_range := v_dist <= v_radius;

  if p_kind = 'in' then
    select (value->>'start')::time into v_start from public.settings where key = 'work_hours';
    select (value #>> '{}')::int into v_grace from public.settings where key = 'late_grace_minutes';
    if v_now_local > v_start + make_interval(mins => coalesce(v_grace, 0)) then
      v_late := true;
      v_late_min := extract(epoch from (v_now_local - v_start))::int / 60;
    end if;

    insert into public.attendance (employee_id, work_date, check_in_at, check_in_lat, check_in_lng,
                                   check_in_distance_m, check_in_in_range, is_late, late_minutes, note)
    values (v_emp, v_today, now(), p_lat, p_lng, round(v_dist::numeric, 1), v_in_range, v_late, v_late_min, p_note)
    on conflict (employee_id, work_date) do update
      set check_in_at = coalesce(public.attendance.check_in_at, excluded.check_in_at),
          check_in_lat = coalesce(public.attendance.check_in_lat, excluded.check_in_lat),
          check_in_lng = coalesce(public.attendance.check_in_lng, excluded.check_in_lng),
          check_in_distance_m = coalesce(public.attendance.check_in_distance_m, excluded.check_in_distance_m),
          check_in_in_range = coalesce(public.attendance.check_in_in_range, excluded.check_in_in_range),
          is_late = case when public.attendance.check_in_at is null then excluded.is_late else public.attendance.is_late end,
          late_minutes = case when public.attendance.check_in_at is null then excluded.late_minutes else public.attendance.late_minutes end
    returning * into v_row;
  elsif p_kind = 'out' then
    update public.attendance
       set check_out_at = now(), check_out_lat = p_lat, check_out_lng = p_lng,
           check_out_distance_m = round(v_dist::numeric, 1), check_out_in_range = v_in_range,
           note = coalesce(p_note, note)
     where employee_id = v_emp and work_date = v_today
    returning * into v_row;
    if v_row.id is null then raise exception 'วันนี้ยังไม่ได้เช็คอิน'; end if;
  else
    raise exception 'invalid kind';
  end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------
alter table public.teams          enable row level security;
alter table public.employees      enable row level security;
alter table public.app_users      enable row level security;
alter table public.settings       enable row level security;
alter table public.leave_types    enable row level security;
alter table public.holidays       enable row level security;
alter table public.attendance     enable row level security;
alter table public.leave_requests enable row level security;
alter table public.ot_requests    enable row level security;

-- reference data: everyone signed in can read, admin writes
create policy "teams read"        on public.teams       for select to authenticated using (true);
create policy "teams admin"       on public.teams       for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "settings read"     on public.settings    for select to authenticated using (true);
create policy "settings admin"    on public.settings    for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leave_types read"  on public.leave_types for select to authenticated using (true);
create policy "leave_types admin" on public.leave_types for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "holidays read"     on public.holidays    for select to authenticated using (true);
create policy "holidays admin"    on public.holidays    for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- app_users: admin all; a user can read own row
create policy "app_users self"  on public.app_users for select to authenticated using (auth_user_id = auth.uid());
create policy "app_users admin" on public.app_users for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- employees: admin all; staff read + update own row (limited columns enforced in app)
create policy "employees self read"   on public.employees for select to authenticated using (id = public.my_employee_id());
create policy "employees self update" on public.employees for update to authenticated using (id = public.my_employee_id()) with check (id = public.my_employee_id());
create policy "employees admin"       on public.employees for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- attendance: staff own (via RPC), admin all
create policy "attendance self"  on public.attendance for select to authenticated using (employee_id = public.my_employee_id());
create policy "attendance admin" on public.attendance for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- leave: staff create/read own, cancel own pending; admin all
create policy "leave self read"   on public.leave_requests for select to authenticated using (employee_id = public.my_employee_id());
create policy "leave self insert" on public.leave_requests for insert to authenticated with check (employee_id = public.my_employee_id() and status = 'pending');
create policy "leave self cancel" on public.leave_requests for update to authenticated
  using (employee_id = public.my_employee_id() and status = 'pending')
  with check (employee_id = public.my_employee_id() and status in ('pending','cancelled'));
create policy "leave admin"       on public.leave_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- OT: same pattern
create policy "ot self read"   on public.ot_requests for select to authenticated using (employee_id = public.my_employee_id());
create policy "ot self insert" on public.ot_requests for insert to authenticated with check (employee_id = public.my_employee_id() and status = 'pending');
create policy "ot self cancel" on public.ot_requests for update to authenticated
  using (employee_id = public.my_employee_id() and status = 'pending')
  with check (employee_id = public.my_employee_id() and status in ('pending','cancelled'));
create policy "ot admin"       on public.ot_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- staff may only change their own contact fields; everything else is admin-only
create or replace function public.guard_employee_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for migrations / SQL editor / service role → no restriction
  if auth.uid() is not null and not public.is_admin() then
    if new.emp_code is distinct from old.emp_code or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name or new.title is distinct from old.title
       or new.team_id is distinct from old.team_id or new.position is distinct from old.position
       or new.email is distinct from old.email or new.birth_date is distinct from old.birth_date
       or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date
       or new.status is distinct from old.status or new.needs_review is distinct from old.needs_review
       or new.review_note is distinct from old.review_note or new.notes is distinct from old.notes then
      raise exception 'พนักงานแก้ได้เฉพาะชื่อเล่น โทรศัพท์ ที่อยู่ และรูป';
    end if;
  end if;
  return new;
end $$;
create trigger employees_guard before update on public.employees for each row execute function public.guard_employee_update();

-- staff directory: safe columns only, visible to every signed-in user
create view public.employee_directory
  with (security_invoker = false) as
  select e.id, e.emp_code, e.title, e.first_name, e.last_name, e.nickname, e.position, e.email, e.phone,
         e.status, e.start_date, e.photo_url, t.abbrev as team_abbrev, t.name_th as team_name
    from public.employees e left join public.teams t on t.id = e.team_id
   where e.status <> 'resigned';
grant select on public.employee_directory to authenticated;

-- ---------------------------------------------------------------------
-- 6. Seed — บริษัท ปากาม้า (ไทยแลนด์) จำกัด
-- ---------------------------------------------------------------------
insert into public.teams (code, abbrev, name_th, name_en) values
  ('01', 'SW', 'ทีมขายและคลังสินค้า', 'Sale & Warehouse'),
  ('02', 'GC', 'ทีมกราฟิกและคอนเทนต์', 'Graphic & Content');

insert into public.settings (key, value, description) values
  ('company',            '{"name_th":"บริษัท ปากาม้า (ไทยแลนด์) จำกัด","name_en":"PAHKAHMAH (THAILAND) CO., LTD."}', 'ชื่อบริษัท'),
  ('office_location',    '{"name":"PAHKAHMAH Showroom","lat":13.7141686,"lng":100.3446659,"radius_m":200}', 'จุดเช็คอินและรัศมีที่อนุญาต (เมตร)'),
  ('work_hours',         '{"start":"08:30","end":"17:30"}', 'เวลาทำงาน'),
  ('late_grace_minutes', '15', 'ผ่อนผันสาย (นาที)'),
  ('workdays',           '[1,2,3,4,5]', 'วันทำงาน (1=จันทร์ … 7=อาทิตย์)'),
  ('employee_code_format','"PKM-{yy}{team}{nn}"', 'รูปแบบรหัสพนักงาน');

insert into public.leave_types (code, name_th, quota_days, requires_doc, sort_order) values
  ('sick',     'ลาป่วย',   30, true,  1),
  ('personal', 'ลากิจ',     6, false, 2),
  ('annual',   'ลาพักร้อน', 6, false, 3);

insert into public.employees (emp_code, title, first_name, last_name, team_id, email, birth_date, address, start_date, status, needs_review, review_note) values
  ('PKM-650201', null, 'อารดา', 'เพ็งจันทร์', 2, 'arada.p.pkmth@gmail.com', '1993-09-28', '18 ม.7 ต.ท่าตลาด อ.สามพราน จ.นครปฐม 73110', '2022-11-16', 'active', false, null),
  ('PKM-660101', null, 'จันทกาญจน์', 'สมเสาร์', 1, 'jantakarn.s.pkmth@gmail.com', '1989-06-22', '81/165 เพชรเกษม 116 แขวงหนองค้างพลู เขตหนองแขม 10160', '2023-10-06', 'active', true, 'วันเริ่มงานในตารางเดิมพิมพ์ว่า 6/10/266 — ตั้งเป็น 6 ต.ค. 2566 กรุณายืนยัน'),
  ('PKM-670102', 'นางสาว', 'อนัญญา', 'สุขเกษม', 1, 'ananya.s.pkmth@gmail.com', '1997-12-06', '44/61 ซอยเพชรเกษม 110 แยก 6 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160', '2024-01-11', 'active', false, null),
  ('PKM-670201', null, 'ธนกฤต', 'เลิศพิเชฐกุลชัย', 2, 'tanakrit.l.pkmth@gmail.com', '2002-08-04', '23 เพชรเกษม 69 แยก 2 ซอย 6-2-9 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพฯ 10160', '2024-04-16', 'active', false, null),
  ('PKM-690103', null, 'พีรพงษ์', 'ชุมพล', 1, 'peerapong.c.pkmth@gmail.com', null, null, '2026-09-16', 'probation', true, 'ยังไม่มีวันเกิดและที่อยู่ — วันเริ่มงานในตารางเดิมพิมพ์ว่า 16/9/1969 ตั้งเป็น 16 ก.ย. 2569'),
  ('PKM-690203', null, 'ศุภกร', 'อัยชะ', 2, 'supakorn.a.pkmth@gmail.com', '2001-11-01', '119/3 หมู่ 3 ต.สวนหลวง อ.กระทุ่มแบน จ.สมุทรสาคร', '2026-03-16', 'active', false, null);

update public.employees e set position = p.position from (values
  ('PKM-650201', 'Art Director'),
  ('PKM-660101', 'เอกสารขายและคลังสินค้า'),
  ('PKM-670102', 'คลังวัตถุดิบ/สินค้า และ QA'),
  ('PKM-670201', 'Content Video Marketing'),
  ('PKM-690103', 'แอดมินขายออนไลน์'),
  ('PKM-690203', 'Visual Graphic')
) as p(emp_code, position) where e.emp_code = p.emp_code;

-- admins (2) + one staff account per employee
insert into public.app_users (email, role, display_name) values
  ('pahkahmah@gmail.com',  'admin', 'ธเนษฐ'),
  ('backoffpkh@gmail.com', 'admin', 'สุมนวินีต์');

insert into public.app_users (email, role, employee_id, display_name)
select e.email, 'staff', e.id, e.first_name from public.employees e where e.email is not null;
