-- =====================================================================
-- PKM ERP — 0018: ปฏิทินงานทีม (GC ROOM) — หัวข้อ Routine รายคน, งานมีวันเริ่ม/กำหนดเสร็จ+เวลา,
--   แนบรูป storyboard หลายรูป, งานประจำแบบรายเดือน/สัปดาห์แรก/วันเบิ้ล สร้างล่วงหน้า
-- =====================================================================

-- หัวข้อ Routine ของแต่ละคนในห้อง (employee_id null = หัวข้อกลางของห้อง)
create table public.work_topics (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.work_rooms(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  name        text not null,
  color       text not null default '#452a79',
  sort_order  int not null default 100,
  is_active   boolean not null default true,
  created_by  uuid references public.app_users(id),
  created_at  timestamptz not null default now()
);
create index on public.work_topics (room_id, employee_id);

alter table public.work_tasks
  add column start_date date,
  add column due_time   time,
  add column topic_id   uuid references public.work_topics(id) on delete set null;
create index on public.work_tasks (room_id, start_date);

-- รูป/ไฟล์แนบของงาน (storyboard — หลายรูป)
create table public.work_task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.work_tasks(id) on delete cascade,
  url         text not null,
  name        text,
  caption     text,
  sort_order  int not null default 0,
  created_by  uuid references public.app_users(id),
  created_at  timestamptz not null default now()
);
create index on public.work_task_files (task_id, sort_order);

-- งานประจำ: เพิ่มกติการายเดือน / สัปดาห์แรก / วันเบิ้ล, กำหนดเสร็จวันศุกร์, หัวข้อ, สร้างล่วงหน้า
alter table public.work_routines
  add column rule        text not null default 'weekly' check (rule in ('weekly', 'monthly', 'first_week', 'double_day')),
  add column month_days  int[],                       -- rule = monthly: วันที่ของเดือน เช่น {15} {25}
  add column due_friday  boolean not null default false,   -- กำหนดเสร็จ = ศุกร์ของสัปดาห์นั้น (ไม่งั้น = วันเดียวกัน)
  add column due_time    time,
  add column topic_id    uuid references public.work_topics(id) on delete set null,
  add column plan_ahead  boolean not null default false,   -- สร้างล่วงหน้า 14 วัน ให้เห็นในปฏิทิน
  add column priority    public.task_priority not null default 'normal';

-- ศุกร์ของสัปดาห์ (ถ้าเลยศุกร์แล้ว = ศุกร์ถัดไป)
create or replace function public.friday_of(p_date date) returns date
language sql immutable as $$
  select case when extract(isodow from p_date) <= 5 then p_date + (5 - extract(isodow from p_date))::int
              else p_date + (12 - extract(isodow from p_date))::int end;
$$;

-- สร้างงานประจำของวันที่กำหนด (idempotent)
create or replace function public.generate_routine_tasks(p_date date default (now() at time zone 'Asia/Bangkok')::date)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record; v_match boolean; v_dow int := extract(isodow from p_date)::int; v_dom int := extract(day from p_date)::int; v_mon int := extract(month from p_date)::int;
begin
  for r in select * from public.work_routines where is_active loop
    v_match := case r.rule
      when 'weekly'     then v_dow = any(r.weekdays)
      when 'monthly'    then r.month_days is not null and v_dom = any(r.month_days)
      when 'first_week' then v_dom <= 7 and v_dow = any(r.weekdays)
      when 'double_day' then v_dom = v_mon
      else false end;
    if not v_match then continue; end if;
    insert into public.work_tasks (room_id, title, description, assignee_id, created_by, start_date, due_date, due_time, priority, topic_id, routine_id, routine_date)
    values (r.room_id, r.title, r.description, r.assignee_id, r.created_by, p_date, case when r.due_friday then public.friday_of(p_date) else p_date end,
            coalesce(r.due_time, '17:30'), r.priority, r.topic_id, r.id, p_date)
    on conflict (routine_id, routine_date) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- วันนี้ + ล่วงหน้า 14 วันสำหรับงานประจำที่ตั้ง plan_ahead
create or replace function public.generate_routine_tasks_ahead()
returns int
language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Bangkok')::date; v_n int := 0; d int; r record; v_date date; v_match boolean;
begin
  v_n := public.generate_routine_tasks(v_today);
  for d in 1..14 loop
    v_date := v_today + d;
    for r in select * from public.work_routines where is_active and plan_ahead loop
      v_match := case r.rule
        when 'weekly'     then extract(isodow from v_date)::int = any(r.weekdays)
        when 'monthly'    then r.month_days is not null and extract(day from v_date)::int = any(r.month_days)
        when 'first_week' then extract(day from v_date)::int <= 7 and extract(isodow from v_date)::int = any(r.weekdays)
        when 'double_day' then extract(day from v_date)::int = extract(month from v_date)::int
        else false end;
      if not v_match then continue; end if;
      insert into public.work_tasks (room_id, title, description, assignee_id, created_by, start_date, due_date, due_time, priority, topic_id, routine_id, routine_date)
      values (r.room_id, r.title, r.description, r.assignee_id, r.created_by, v_date, case when r.due_friday then public.friday_of(v_date) else v_date end,
              coalesce(r.due_time, '17:30'), r.priority, r.topic_id, r.id, v_date)
      on conflict (routine_id, routine_date) do nothing;
      if found then v_n := v_n + 1; end if;
    end loop;
  end loop;
  return v_n;
end $$;

-- สร้างงานจากปฏิทิน: กำหนดเสร็จว่าง → ศุกร์ของสัปดาห์ 17:30
create or replace function public.create_calendar_task(
  p_room uuid, p_title text, p_description text, p_assignee uuid, p_start date, p_due date, p_due_time time, p_priority public.task_priority, p_topic uuid, p_checklist text[]
) returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_start date := coalesce(p_start, (now() at time zone 'Asia/Bangkok')::date);
begin
  v_t := public.create_task(p_room, p_title, p_description, p_assignee, coalesce(p_due, public.friday_of(v_start)), p_priority, p_checklist);
  update public.work_tasks set start_date = v_start, due_time = coalesce(p_due_time, '17:30'), topic_id = p_topic where id = v_t.id returning * into v_t;
  return v_t;
end $$;

-- ---------------------------------------------------------------------
alter table public.work_topics enable row level security;
alter table public.work_task_files enable row level security;
create policy "topics read"  on public.work_topics for select to authenticated using (public.is_room_member(room_id));
create policy "topics write" on public.work_topics for all to authenticated
  using (public.is_admin() or public.is_room_lead(room_id) or (public.is_room_member(room_id) and employee_id = public.my_employee_id()))
  with check (public.is_admin() or public.is_room_lead(room_id) or (public.is_room_member(room_id) and employee_id = public.my_employee_id()));
create policy "task files read"  on public.work_task_files for select to authenticated using (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)));
create policy "task files write" on public.work_task_files for all to authenticated
  using (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)))
  with check (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_room_member(t.room_id)));

-- ---------------------------------------------------------------------
-- seed: หัวข้อ Routine ของทีม GC + งานประจำของธนกฤต
-- ---------------------------------------------------------------------
do $$
declare v_room uuid; v_arada uuid; v_supakorn uuid; v_thanakrit uuid; v_owner uuid;
        t_routine uuid; t_broadcast uuid; t_story uuid;
begin
  select id into v_room from public.work_rooms where key = 'gc-room';
  if v_room is null then return; end if;
  select id into v_arada     from public.employees where first_name = 'อารดา'  and status <> 'resigned' limit 1;
  select id into v_supakorn  from public.employees where first_name = 'ศุภกร'  and status <> 'resigned' limit 1;
  select id into v_thanakrit from public.employees where first_name = 'ธนกฤต' and status <> 'resigned' limit 1;
  select id into v_owner from public.app_users where email = 'pahkahmah@gmail.com';

  if v_arada is not null then
    insert into public.work_topics (room_id, employee_id, name, color, sort_order, created_by) values
      (v_room, v_arada, 'New Graphic',                  '#452a79', 10, v_owner),
      (v_room, v_arada, 'Brand & Corporate Packaging',  '#7c3aed', 11, v_owner),
      (v_room, v_arada, 'New Product Development',      '#0363b1', 12, v_owner),
      (v_room, v_arada, 'Corporate Customer',           '#c2410c', 13, v_owner);
  end if;
  if v_supakorn is not null then
    insert into public.work_topics (room_id, employee_id, name, color, sort_order, created_by) values
      (v_room, v_supakorn, 'Website',        '#0363b1', 20, v_owner),
      (v_room, v_supakorn, 'Visual Design',  '#06acb4', 21, v_owner),
      (v_room, v_supakorn, 'Content Design', '#00856b', 22, v_owner),
      (v_room, v_supakorn, 'New Colors',     '#e74f99', 23, v_owner);
  end if;
  if v_thanakrit is not null then
    insert into public.work_topics (room_id, employee_id, name, color, sort_order, created_by) values (v_room, v_thanakrit, 'Routine Content',      '#452a79', 30, v_owner) returning id into t_routine;
    insert into public.work_topics (room_id, employee_id, name, color, sort_order, created_by) values (v_room, v_thanakrit, 'Broadcast LINE OA',    '#00856b', 31, v_owner) returning id into t_broadcast;
    insert into public.work_topics (room_id, employee_id, name, color, sort_order, created_by) values (v_room, v_thanakrit, 'ภาพเล่าเรื่องแบรนด์', '#e74f99', 32, v_owner) returning id into t_story;

    -- Routine content รายวัน (จ–ศ) — หัวข้อประจำวัน
    insert into public.work_routines (room_id, title, description, assignee_id, weekdays, rule, topic_id, plan_ahead, created_by) values
      (v_room, 'Routine Content — Thainess Today',                         'คอนเทนต์วันจันทร์: Thainess Today',                               v_thanakrit, '{1}', 'weekly', t_routine, true, v_owner),
      (v_room, 'Routine Content — Souvenirs Short Video / Short Reels',    'คอนเทนต์วันอังคาร: Souvenirs Short Video | Short Reels Style',     v_thanakrit, '{2}', 'weekly', t_routine, true, v_owner),
      (v_room, 'Routine Content — Product',                                'คอนเทนต์วันพุธ: Product',                                         v_thanakrit, '{3}', 'weekly', t_routine, true, v_owner),
      (v_room, 'Routine Content — Review',                                 'คอนเทนต์วันพฤหัส: Review',                                        v_thanakrit, '{4}', 'weekly', t_routine, true, v_owner),
      (v_room, 'Routine Content — Story Telling',                          'คอนเทนต์วันศุกร์: Story Telling',                                 v_thanakrit, '{5}', 'weekly', t_routine, true, v_owner);
    -- Broadcast LINE OA
    insert into public.work_routines (room_id, title, description, assignee_id, weekdays, rule, month_days, topic_id, plan_ahead, created_by) values
      (v_room, 'Broadcast LINE OA — New Product',             'สัปดาห์แรกของเดือน วันพฤหัส',          v_thanakrit, '{4}', 'first_week', null,   t_broadcast, true, v_owner),
      (v_room, 'Broadcast LINE OA — Promotion',               'สัปดาห์แรกของเดือน วันศุกร์',           v_thanakrit, '{5}', 'first_week', null,   t_broadcast, true, v_owner),
      (v_room, 'Broadcast LINE OA — New Product / New Color', 'วันที่ 15 ของทุกเดือน',                v_thanakrit, '{}',  'monthly',    '{15}', t_broadcast, true, v_owner),
      (v_room, 'Broadcast LINE OA — Promotion',               'วันที่ 25 ของทุกเดือน',                v_thanakrit, '{}',  'monthly',    '{25}', t_broadcast, true, v_owner),
      (v_room, 'Broadcast LINE OA — Promotion วันเบิ้ล',       'วันเบิ้ล 1/1, 2/2 … 12/12',           v_thanakrit, '{}',  'double_day', null,   t_broadcast, true, v_owner);
    -- ภาพเล่าเรื่องแบรนด์ — สร้างวันจันทร์ กำหนดเสร็จศุกร์
    insert into public.work_routines (room_id, title, description, assignee_id, weekdays, rule, due_friday, topic_id, plan_ahead, created_by) values
      (v_room, 'โพสต์รีวิวสินค้าของลูกค้า 2 ภาพ',        'ภายในสัปดาห์นี้ (ไม่กำหนดวัน)', v_thanakrit, '{1}', 'weekly', true, t_story, true, v_owner),
      (v_room, 'โพสต์ภาพบรรยากาศ showroom 2 ภาพ',       'ภายในสัปดาห์นี้ (ไม่กำหนดวัน)', v_thanakrit, '{1}', 'weekly', true, t_story, true, v_owner),
      (v_room, 'โพสต์ภาพงาน corporate ลูกค้า 2 ภาพ',     'ภายในสัปดาห์นี้ (ไม่กำหนดวัน)', v_thanakrit, '{1}', 'weekly', true, t_story, true, v_owner);
  end if;
end $$;
