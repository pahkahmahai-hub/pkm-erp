-- =====================================================================
-- PKM ERP — 0016: ตารางส่งสินค้าห้าง (Store delivery board) — ทีม SW
--   แถว = ห้าง/สาขา · คอลัมน์ = สัปดาห์ · ช่อง = งานส่ง 1 รายการ พร้อมเลขใบส่งของ สีตามขั้นตอน
--   ขั้นตอน: 1 สั่งจัด → 2 ส่งลิสต์ → 3 ออกใบจัดสินค้า/ใบส่งของ (ตัดสต็อกเมื่อออกเอกสารขาย) → 4 จัดเสร็จ → 5 ส่งแล้ว → 6 อัพเข้าระบบห้าง → 7 สินค้าถึงแล้ว
-- =====================================================================

create table public.delivery_stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,
  group_name  text,                                   -- Central / Robinson / HC / Paragon / Big C …
  contact_id  uuid references public.contacts(id),   -- ลูกค้าในสมุดรายชื่อ (ใช้ออกใบส่งของ)
  color       text not null default '#452a79',
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  closed_at   date,
  created_at  timestamptz not null default now()
);

create table public.store_deliveries (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.delivery_stores(id) on delete cascade,
  week_start    date not null,                        -- วันจันทร์ของสัปดาห์
  target_date   date,                                 -- วันที่ตั้งใจส่ง
  step          smallint not null default 1 check (step between 1 and 7),
  doc_no        text,                                 -- เลขใบส่งของ/ใบกำกับ (พิมพ์เอง หรือดึงจากเอกสารขาย)
  sales_doc_id  uuid references public.sales_docs(id) on delete set null,
  po_no         text,
  assignee_id   uuid references public.employees(id),
  note          text,
  step_log      jsonb not null default '[]'::jsonb,   -- [{step, at, by}]
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.store_deliveries (store_id, week_start);
create index on public.store_deliveries (week_start);

-- ---------------------------------------------------------------------
create or replace function public.can_deliver() returns boolean
language sql stable security definer set search_path = public as $$ select public.can_sell(); $$;

create or replace function public.save_delivery_store(p_id uuid, p_name text, p_short text, p_group text, p_contact uuid, p_color text, p_sort int, p_active boolean) returns public.delivery_stores
language plpgsql security definer set search_path = public as $$
declare s public.delivery_stores;
begin
  if not public.can_deliver() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_id is null then
    insert into public.delivery_stores (name, short_name, group_name, contact_id, color, sort_order, is_active)
    values (p_name, p_short, p_group, p_contact, coalesce(p_color, '#452a79'), coalesce(p_sort, 100), coalesce(p_active, true)) returning * into s;
  else
    update public.delivery_stores set name = p_name, short_name = p_short, group_name = p_group, contact_id = p_contact, color = coalesce(p_color, color), sort_order = coalesce(p_sort, sort_order),
      is_active = coalesce(p_active, is_active), closed_at = case when coalesce(p_active, is_active) then null else coalesce(closed_at, current_date) end
    where id = p_id returning * into s;
  end if;
  return s;
end $$;

create or replace function public.delete_delivery_store(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_deliver() then raise exception 'ไม่มีสิทธิ์'; end if;
  if exists (select 1 from public.store_deliveries where store_id = p_id) then
    update public.delivery_stores set is_active = false, closed_at = coalesce(closed_at, current_date) where id = p_id;   -- มีประวัติ → ปิดแทนลบ
  else
    delete from public.delivery_stores where id = p_id;
  end if;
end $$;

-- create / update a delivery job; p_step moves the step (log every change)
create or replace function public.upsert_store_delivery(p_id uuid, p_store uuid, p_week date, p_target date, p_step int, p_doc_no text, p_sales_doc uuid, p_po text, p_assignee uuid, p_note text)
returns public.store_deliveries language plpgsql security definer set search_path = public as $$
declare d public.store_deliveries; v_prev int; v_doc_no text := p_doc_no; v_me uuid := public.current_app_user_id();
begin
  if not public.can_deliver() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_sales_doc is not null and v_doc_no is null then select doc_no into v_doc_no from public.sales_docs where id = p_sales_doc; end if;
  if p_id is null then
    insert into public.store_deliveries (store_id, week_start, target_date, step, doc_no, sales_doc_id, po_no, assignee_id, note, step_log, created_by)
    values (p_store, (date_trunc('week', p_week))::date, p_target, coalesce(p_step, 1), v_doc_no, p_sales_doc, p_po, p_assignee, p_note,
            jsonb_build_array(jsonb_build_object('step', coalesce(p_step, 1), 'at', now(), 'by', v_me)), v_me) returning * into d;
    if p_assignee is not null then perform public.notify_user(public.user_id_of_employee(p_assignee), null, 'ได้รับมอบหมายงานส่งห้าง: ' || (select name from public.delivery_stores where id = p_store) || coalesce(' สัปดาห์ ' || to_char(p_week, 'DD/MM'), '')); end if;
  else
    select * into d from public.store_deliveries where id = p_id;
    if d.id is null then raise exception 'ไม่พบรายการ'; end if;
    v_prev := d.step;
    update public.store_deliveries set store_id = coalesce(p_store, store_id), week_start = coalesce((date_trunc('week', p_week))::date, week_start), target_date = coalesce(p_target, target_date),
      step = coalesce(p_step, step), doc_no = coalesce(v_doc_no, doc_no), sales_doc_id = coalesce(p_sales_doc, sales_doc_id), po_no = coalesce(p_po, po_no), assignee_id = coalesce(p_assignee, assignee_id),
      note = coalesce(p_note, note), updated_at = now(),
      step_log = case when p_step is not null and p_step <> v_prev then step_log || jsonb_build_object('step', p_step, 'at', now(), 'by', v_me) else step_log end
    where id = p_id returning * into d;
    if p_assignee is not null and p_assignee is distinct from (select assignee_id from public.store_deliveries where id = p_id) then null; end if;
  end if;
  return d;
end $$;

create or replace function public.delete_store_delivery(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_deliver() then raise exception 'ไม่มีสิทธิ์'; end if;
  delete from public.store_deliveries where id = p_id;
end $$;

-- when a sales doc linked to a delivery gets issued, bump to step 3 automatically
create or replace function public.delivery_follow_sales_doc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status::text in ('issued', 'paid') and (old.status is distinct from new.status) then
    update public.store_deliveries set step = greatest(step, 3), doc_no = coalesce(doc_no, new.doc_no), updated_at = now(),
      step_log = step_log || jsonb_build_object('step', 3, 'at', now(), 'by', public.current_app_user_id(), 'auto', true)
    where sales_doc_id = new.id and step < 3;
  end if;
  return new;
end $$;
drop trigger if exists sales_doc_delivery_step on public.sales_docs;
create trigger sales_doc_delivery_step after update on public.sales_docs for each row execute function public.delivery_follow_sales_doc();

alter table public.delivery_stores enable row level security;
alter table public.store_deliveries enable row level security;
create policy "delivery stores read" on public.delivery_stores for select to authenticated using (true);
create policy "store deliveries read" on public.store_deliveries for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- seed stores from the current tracking sheet (closed ones left out)
-- ---------------------------------------------------------------------
insert into public.delivery_stores (name, short_name, group_name, color, sort_order) values
  ('ROBINSON JUNGCEYLON', 'RB JUNGCEYLON', 'Robinson', '#0363b1', 10),
  ('CENTRAL PATONG',      'CTR PATONG',    'Central',  '#452a79', 20),
  ('CENTRAL BANGRAK',     'CTR BANGRAK',   'Central',  '#452a79', 21),
  ('CENTRAL CHIDLOM',     'CTR CHIDLOM',   'Central',  '#452a79', 22),
  ('CENTRAL SAMUI',       'CTR SAMUI',     'Central',  '#452a79', 23),
  ('CENTRAL PATTAYA',     'CTR PATTAYA',   'Central',  '#452a79', 24),
  ('ICONSIAM',            'ICONSIAM',      'ICONSIAM', '#8a5a00', 30),
  ('HC CTW',              'HC CTW',        'Hug Craft','#00856b', 40),
  ('HC PATTAYA',          'HC PATTAYA',    'Hug Craft','#00856b', 41),
  ('HC PHUKET',           'HC PHUKET',     'Hug Craft','#00856b', 42),
  ('HC HATYAI',           'HC HATYAI',     'Hug Craft','#00856b', 43),
  ('HC CHIANGMAI',        'HC CHIANGMAI',  'Hug Craft','#00856b', 44),
  ('HC DCP',              'HC DCP',        'Hug Craft','#00856b', 45),
  ('HC KBI',              'HC KBI',        'Hug Craft','#00856b', 46),
  ('PARAGON G',           'PARAGON G',     'Paragon',  '#06acb4', 50),
  ('PARAGON G POP UP',    'PARAGON POPUP', 'Paragon',  '#06acb4', 51),
  ('PARAGON 4',           'PARAGON 4',     'Paragon',  '#06acb4', 52),
  ('PARAGON 3',           'PARAGON 3',     'Paragon',  '#06acb4', 53),
  ('EMSPHERE',            'EMSPHERE',      'The Mall', '#e74f99', 60),
  ('EMPORIUM 4',          'EMPORIUM 4',    'The Mall', '#e74f99', 61),
  ('SARAPADTHAI',         'SARAPADTHAI',   'Central',  '#452a79', 70),
  ('BLUE PORT',           'BLUE PORT',     'Blue Port','#2f6b4f', 71),
  ('AMARIN',              'AMARIN',        'Amarin',   '#c2410c', 72),
  ('Big C marina',        'BC MARINA',     'Big C',    '#e42213', 80),
  ('Big C พระราม 4',      'BC พระราม4',    'Big C',    '#e42213', 81),
  ('Big C พัทยากลาง',     'BC พัทยากลาง',  'Big C',    '#e42213', 82),
  ('Big C อ่อนนุช',       'BC อ่อนนุช',    'Big C',    '#e42213', 83),
  ('Big C สะพานควาย',     'BC สะพานควาย',  'Big C',    '#e42213', 84);
