-- =====================================================================
-- PKM ERP — 0005: Work module (ห้องงาน · สั่งงาน · ติดตามงาน · คอมเมนต์ · งานประจำ)
-- Run after 0004
-- =====================================================================

create type public.task_status as enum ('open', 'in_progress', 'done', 'accepted', 'returned', 'cancelled');
create type public.task_priority as enum ('normal', 'urgent');

-- ห้องงาน (ตรงกับกลุ่ม LINE)
create table public.work_rooms (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,        -- visual / graphic / content / office / operation / online / teamwork
  name          text not null,
  color         text not null default '#452a79',
  description   text,
  line_group_id text,                        -- ไว้เสียบ LINE bot ภายหลัง
  sort_order    int not null default 0,
  is_active     boolean not null default true
);

create table public.work_room_members (
  room_id      uuid not null references public.work_rooms(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  is_lead      boolean not null default false,
  primary key (room_id, employee_id)
);

-- งานประจำ (สร้างงานให้อัตโนมัติตามวันในสัปดาห์)
create table public.work_routines (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.work_rooms(id) on delete cascade,
  title        text not null,
  description  text,
  assignee_id  uuid references public.employees(id) on delete set null,
  weekdays     int[] not null default '{1,2,3,4,5}',   -- 1=จันทร์ … 7=อาทิตย์
  is_active    boolean not null default true,
  created_by   uuid references public.app_users(id),
  created_at   timestamptz not null default now()
);

create table public.work_tasks (
  id             uuid primary key default gen_random_uuid(),
  task_no        serial,
  room_id        uuid not null references public.work_rooms(id),
  title          text not null,
  description    text,
  assignee_id    uuid references public.employees(id) on delete set null,
  created_by     uuid references public.app_users(id),
  due_date       date,
  priority       public.task_priority not null default 'normal',
  status         public.task_status not null default 'open',
  routine_id     uuid references public.work_routines(id) on delete set null,
  routine_date   date,
  started_at     timestamptz,
  done_at        timestamptz,
  done_by        uuid references public.app_users(id),
  done_note      text,
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.app_users(id),
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (routine_id, routine_date)
);
create index on public.work_tasks (room_id, status);
create index on public.work_tasks (assignee_id, status);
create index on public.work_tasks (due_date);
create trigger work_tasks_updated before update on public.work_tasks for each row execute function public.set_updated_at();

create table public.work_checklist (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.work_tasks(id) on delete cascade,
  label      text not null,
  is_done    boolean not null default false,
  done_at    timestamptz,
  done_by    uuid references public.app_users(id),
  sort_order int not null default 0
);

create table public.work_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.work_tasks(id) on delete cascade,
  author_id  uuid references public.app_users(id),
  body       text,
  image_url  text,
  file_url   text,
  file_name  text,
  kind       text not null default 'comment',   -- comment / status (ระบบบันทึกเหตุการณ์)
  created_at timestamptz not null default now()
);
create index on public.work_comments (task_id, created_at);

-- การแจ้งเตือนในเว็บ
create table public.work_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.app_users(id) on delete cascade,
  task_id     uuid references public.work_tasks(id) on delete cascade,
  message     text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.work_notifications (user_id, read_at);

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.work_room_members where room_id = p_room and employee_id = public.my_employee_id());
$$;

-- user id of an employee (for notifications)
create or replace function public.user_id_of_employee(p_emp uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.app_users where employee_id = p_emp and is_active limit 1;
$$;

create or replace function public.notify_user(p_user uuid, p_task uuid, p_msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null and p_user <> public.current_app_user_id() then
    insert into public.work_notifications (user_id, task_id, message) values (p_user, p_task, p_msg);
  end if;
end $$;

-- system log line inside the task thread
create or replace function public.task_log(p_task uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.work_comments (task_id, author_id, body, kind) values (p_task, public.current_app_user_id(), p_text, 'status');
end $$;

-- create task + checklist in one call; notifies assignee
create or replace function public.create_task(
  p_room uuid, p_title text, p_description text, p_assignee uuid, p_due date, p_priority public.task_priority, p_checklist text[]
) returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_i int := 0; v_label text; v_name text;
begin
  if not public.is_room_member(p_room) then raise exception 'คุณไม่ได้อยู่ในห้องนี้'; end if;
  if p_assignee is not null and not public.is_admin() and not exists (select 1 from public.work_room_members where room_id = p_room and employee_id = p_assignee) then
    raise exception 'ผู้รับงานต้องเป็นสมาชิกห้องนี้';
  end if;
  insert into public.work_tasks (room_id, title, description, assignee_id, created_by, due_date, priority)
  values (p_room, p_title, p_description, p_assignee, public.current_app_user_id(), p_due, coalesce(p_priority, 'normal'))
  returning * into v_t;
  if p_checklist is not null then
    foreach v_label in array p_checklist loop
      if length(trim(v_label)) > 0 then
        insert into public.work_checklist (task_id, label, sort_order) values (v_t.id, trim(v_label), v_i);
        v_i := v_i + 1;
      end if;
    end loop;
  end if;
  select coalesce(display_name, email) into v_name from public.app_users where id = public.current_app_user_id();
  perform public.notify_user(public.user_id_of_employee(p_assignee), v_t.id, v_name || ' สั่งงาน: ' || p_title);
  return v_t;
end $$;

-- status transitions
create or replace function public.set_task_status(p_task uuid, p_status public.task_status, p_note text default null)
returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_me uuid := public.current_app_user_id(); v_my_emp uuid := public.my_employee_id(); v_name text;
begin
  select * into v_t from public.work_tasks where id = p_task;
  if v_t.id is null then raise exception 'ไม่พบงาน'; end if;
  if not public.is_room_member(v_t.room_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  select coalesce(display_name, email) into v_name from public.app_users where id = v_me;

  if p_status in ('in_progress', 'done') then
    -- ผู้รับงาน (หรือ admin / ผู้สั่ง) ทำได้
    if not (public.is_admin() or v_t.assignee_id = v_my_emp or v_t.created_by = v_me) then raise exception 'เฉพาะผู้รับงาน'; end if;
    update public.work_tasks set status = p_status,
      started_at = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
      done_at = case when p_status = 'done' then now() else done_at end,
      done_by = case when p_status = 'done' then v_me else done_by end,
      done_note = case when p_status = 'done' then p_note else done_note end
    where id = p_task returning * into v_t;
    perform public.task_log(p_task, case when p_status = 'done' then 'ทำเสร็จแล้ว' || coalesce(' — ' || p_note, '') else 'เริ่มทำงาน' end);
    if p_status = 'done' then perform public.notify_user(v_t.created_by, p_task, v_name || ' ทำเสร็จ: ' || v_t.title || ' (รอตรวจรับ)'); end if;

  elsif p_status in ('accepted', 'returned', 'cancelled') then
    -- ผู้สั่ง หรือ admin
    if not (public.is_admin() or v_t.created_by = v_me) then raise exception 'เฉพาะผู้สั่งงานหรือผู้ดูแล'; end if;
    update public.work_tasks set status = p_status, reviewed_at = now(), reviewed_by = v_me, review_note = p_note
    where id = p_task returning * into v_t;
    perform public.task_log(p_task, case p_status when 'accepted' then 'ตรวจรับแล้ว ✔' when 'returned' then 'ตีกลับให้แก้' || coalesce(' — ' || p_note, '') else 'ยกเลิกงาน' end);
    perform public.notify_user(public.user_id_of_employee(v_t.assignee_id), p_task,
      case p_status when 'accepted' then 'ตรวจรับแล้ว: ' when 'returned' then 'ตีกลับ: ' else 'ยกเลิก: ' end || v_t.title);
  elsif p_status = 'open' then
    update public.work_tasks set status = 'open' where id = p_task returning * into v_t;
  end if;
  return v_t;
end $$;

-- add comment + notify the other side
create or replace function public.add_comment(p_task uuid, p_body text, p_image_url text default null, p_file_url text default null, p_file_name text default null)
returns public.work_comments
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_c public.work_comments; v_me uuid := public.current_app_user_id(); v_name text;
begin
  select * into v_t from public.work_tasks where id = p_task;
  if v_t.id is null or not public.is_room_member(v_t.room_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if coalesce(trim(p_body), '') = '' and p_image_url is null and p_file_url is null then raise exception 'ข้อความว่าง'; end if;
  insert into public.work_comments (task_id, author_id, body, image_url, file_url, file_name)
  values (p_task, v_me, nullif(trim(p_body), ''), p_image_url, p_file_url, p_file_name) returning * into v_c;
  select coalesce(display_name, email) into v_name from public.app_users where id = v_me;
  perform public.notify_user(v_t.created_by, p_task, v_name || ' คอมเมนต์ใน: ' || v_t.title);
  perform public.notify_user(public.user_id_of_employee(v_t.assignee_id), p_task, v_name || ' คอมเมนต์ใน: ' || v_t.title);
  return v_c;
end $$;

-- generate routine tasks for a date (idempotent) — called when someone opens the work module
create or replace function public.generate_routine_tasks(p_date date default (now() at time zone 'Asia/Bangkok')::date)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in select * from public.work_routines where is_active and extract(isodow from p_date)::int = any(weekdays) loop
    insert into public.work_tasks (room_id, title, description, assignee_id, created_by, due_date, routine_id, routine_date)
    values (r.room_id, r.title, r.description, r.assignee_id, r.created_by, p_date, r.id, p_date)
    on conflict (routine_id, routine_date) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.work_rooms          enable row level security;
alter table public.work_room_members   enable row level security;
alter table public.work_routines       enable row level security;
alter table public.work_tasks          enable row level security;
alter table public.work_checklist      enable row level security;
alter table public.work_comments       enable row level security;
alter table public.work_notifications  enable row level security;

create policy "rooms read"    on public.work_rooms for select to authenticated using (true);
create policy "rooms admin"   on public.work_rooms for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "members read"  on public.work_room_members for select to authenticated using (true);
create policy "members admin" on public.work_room_members for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "routines read"  on public.work_routines for select to authenticated using (public.is_room_member(room_id));
create policy "routines write" on public.work_routines for all to authenticated
  using (public.is_admin() or exists (select 1 from public.work_room_members m where m.room_id = work_routines.room_id and m.employee_id = public.my_employee_id() and m.is_lead))
  with check (public.is_admin() or exists (select 1 from public.work_room_members m where m.room_id = work_routines.room_id and m.employee_id = public.my_employee_id() and m.is_lead));

create policy "tasks read"   on public.work_tasks for select to authenticated using (public.is_room_member(room_id));
create policy "tasks update" on public.work_tasks for update to authenticated using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));
create policy "tasks delete" on public.work_tasks for delete to authenticated using (public.is_admin() or created_by = public.current_app_user_id());

create policy "checklist read"  on public.work_checklist for select to authenticated using (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)));
create policy "checklist write" on public.work_checklist for all to authenticated
  using (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)))
  with check (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)));

create policy "comments read" on public.work_comments for select to authenticated using (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)));
create policy "comments delete own" on public.work_comments for delete to authenticated using (author_id = public.current_app_user_id() or public.is_admin());

create policy "notif own" on public.work_notifications for select to authenticated using (user_id = public.current_app_user_id());
create policy "notif own update" on public.work_notifications for update to authenticated using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

-- realtime for the task thread
alter publication supabase_realtime add table public.work_comments;
alter publication supabase_realtime add table public.work_tasks;

-- storage bucket for work attachments
insert into storage.buckets (id, name, public) values ('work-files', 'work-files', true) on conflict (id) do nothing;
create policy "work files read"   on storage.objects for select using (bucket_id = 'work-files');
create policy "work files write"  on storage.objects for insert to authenticated with check (bucket_id = 'work-files');
create policy "work files delete" on storage.objects for delete to authenticated using (bucket_id = 'work-files');

-- ---------------------------------------------------------------------
-- Seed: 7 rooms matching the LINE groups
-- ---------------------------------------------------------------------
insert into public.work_rooms (key, name, color, description, sort_order) values
  ('teamwork',  'TEAMWORK',      '#452a79', 'ทุกคน — เรื่องทั่วไปของบริษัท', 0),
  ('office',    'OFFICE',        '#e42213', 'เอกสารขาย · ส่งห้าง · ใบแจ้งหนี้', 1),
  ('operation', 'OPERATION',     '#00856b', 'คลัง · ลูกค้า Corporate · ของเสีย', 2),
  ('online',    'ONLINE',        '#efb925', 'ขายออนไลน์ · ลงสินค้าแพลตฟอร์ม', 3),
  ('graphic',   'GRAPHIC',       '#06acb4', 'ออกแบบสินค้าใหม่ · งานกราฟิก', 4),
  ('visual',    'VISUAL DESIGN', '#0363b1', 'สีสินค้า · เว็บไซต์ · กราฟิก', 5),
  ('content',   'CONTENT',       '#e74f99', 'Routine content · วิดีโอ', 6);

-- members (by employee code) — lead = คนหลักของห้อง; admins (ธเนษฐ, สุมนวินีต์) เห็นทุกห้องอยู่แล้ว
insert into public.work_room_members (room_id, employee_id, is_lead)
select r.id, e.id, m.lead from (values
  ('visual',    'PKM-690203', true),  ('visual',    'PKM-650201', false),
  ('graphic',   'PKM-650201', true),
  ('content',   'PKM-670201', true),  ('content',   'PKM-650201', false),
  ('office',    'PKM-660101', true),
  ('operation', 'PKM-670102', true),  ('operation', 'PKM-660101', false),
  ('online',    'PKM-690103', true),  ('online',    'PKM-660101', false),
  ('teamwork',  'PKM-650201', false), ('teamwork', 'PKM-660101', false), ('teamwork', 'PKM-670102', false),
  ('teamwork',  'PKM-670201', false), ('teamwork', 'PKM-690103', false), ('teamwork', 'PKM-690203', false)
) as m(room_key, emp_code, lead)
join public.work_rooms r on r.key = m.room_key
join public.employees e on e.emp_code = m.emp_code;

-- routine content (ธนกฤต) จ–ศ
insert into public.work_routines (room_id, title, description, assignee_id, weekdays)
select r.id, x.title, x.descr, e.id, x.days from public.work_rooms r, public.employees e, (values
  ('Thainess Today',                 'ข่าวดี/ความเป็นไทยในสายตาโลก — โพสต์ประจำวันจันทร์', '{1}'::int[]),
  ('Souvenir short video / reels',   'คลิปสั้นของที่ระลึก — ประจำวันอังคาร',               '{2}'::int[]),
  ('Product presentation',           'นำเสนอสินค้า — ประจำวันพุธ',                           '{3}'::int[]),
  ('Review',                         'รีวิวจากลูกค้า/การใช้งาน — ประจำวันพฤหัส',             '{4}'::int[]),
  ('10 ปี ผ้าขาวม้าเป็นมากกว่าผืนผ้า', 'คอนเทนต์ซีรีส์ 10 ปี — ประจำวันศุกร์',                 '{5}'::int[])
) as x(title, descr, days)
where r.key = 'content' and e.emp_code = 'PKM-670201';
