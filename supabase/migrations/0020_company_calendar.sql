-- =====================================================================
-- PKM ERP — 0020: ปฏิทินบริษัท (TEAMWORK) — ออกบูธห้าง (ช่วงวัน), นัดหมาย, ลูกค้าเข้า showroom,
--   ประชุมประจำสัปดาห์/เดือน (งานซ้ำ), กิจกรรม 5ส และอื่น ๆ — แถบสีสำหรับช่วงวัน จุดสีสำหรับงานวันเดียว
-- =====================================================================

create table public.event_categories (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  name       text not null,
  color      text not null,
  sort_order int not null default 100,
  is_active  boolean not null default true
);

create table public.company_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category_id   uuid references public.event_categories(id) on delete set null,
  start_date    date not null,
  end_date      date not null,
  start_time    time,
  end_time      time,
  location      text,
  note          text,
  recur         text check (recur in ('weekly', 'monthly')),   -- งานซ้ำ: ทุกสัปดาห์ (วันเดียวกับ start_date) / ทุกเดือน (วันที่เดียวกับ start_date)
  recur_until   date,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on public.company_events (start_date, end_date);
create trigger company_events_updated before update on public.company_events for each row execute function public.set_updated_at();

alter table public.event_categories enable row level security;
alter table public.company_events enable row level security;
create policy "event categories read"  on public.event_categories for select to authenticated using (true);
create policy "event categories admin" on public.event_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "events read"   on public.company_events for select to authenticated using (true);
create policy "events insert" on public.company_events for insert to authenticated with check (created_by = public.current_app_user_id());
create policy "events update" on public.company_events for update to authenticated using (public.is_admin() or created_by = public.current_app_user_id());
create policy "events delete" on public.company_events for delete to authenticated using (public.is_admin() or created_by = public.current_app_user_id());

insert into public.event_categories (key, name, color, sort_order) values
  ('booth',       'ออกบูธห้าง',          '#e42213', 10),
  ('appointment', 'นัดหมายสำคัญ',        '#c2410c', 20),
  ('customer',    'ลูกค้าเข้า showroom', '#00856b', 30),
  ('meeting',     'ประชุม',              '#452a79', 40),
  ('5s',          'กิจกรรม 5ส',          '#06acb4', 50),
  ('activity',    'กิจกรรมบริษัท',       '#e74f99', 60),
  ('holiday',     'วันหยุด',             '#6b7280', 70),
  ('other',       'อื่น ๆ',              '#8a5a00', 80);
