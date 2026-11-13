-- =====================================================================
-- PKM ERP — 0026: (1) แจ้งเตือนเด้งบนเครื่อง (Web Push)  (2) ช่องให้ Claude อ่านข้อมูลงาน (อ่านอย่างเดียว)
--   ค่าลับ (กุญแจ VAPID / รหัส dispatch / token ของ Claude) ใส่ด้วยไฟล์ "0026_secrets" แยก — ไม่เก็บใน repo
-- =====================================================================
create extension if not exists pg_net with schema extensions;

-- ค่าลับของระบบ — ไม่มี policy ใด ๆ = อ่านได้เฉพาะฟังก์ชัน security definer
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

create or replace function public.secret_of(p_key text) returns text
language sql stable security definer set search_path = public as $$ select value from public.app_secrets where key = p_key $$;
revoke execute on function public.secret_of(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- (1) Web Push
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.app_users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own read" on public.push_subscriptions;
drop policy if exists "push own write" on public.push_subscriptions;
create policy "push own read"  on public.push_subscriptions for select to authenticated using (user_id = public.current_app_user_id());
create policy "push own write" on public.push_subscriptions for all to authenticated using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

-- เรียกโดย API ของเว็บ (ยืนยันด้วยรหัส dispatch): คืนกุญแจส่ง push / ลบเครื่องที่ยกเลิกแล้ว
create or replace function public.push_config(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is null or p_secret is distinct from public.secret_of('push_dispatch_secret') then raise exception 'unauthorized'; end if;
  return jsonb_build_object('public_key', public.secret_of('vapid_public_key'), 'private_key', public.secret_of('vapid_private_key'), 'subject', coalesce(public.secret_of('vapid_subject'), 'mailto:pahkahmah@gmail.com'));
end $$;

create or replace function public.push_prune(p_secret text, p_dead text[], p_ok text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret is distinct from public.secret_of('push_dispatch_secret') then raise exception 'unauthorized'; end if;
  delete from public.push_subscriptions where endpoint = any(coalesce(p_dead, '{}'));
  update public.push_subscriptions set last_ok_at = now() where endpoint = any(coalesce(p_ok, '{}'));
end $$;
grant execute on function public.push_config(text) to anon, authenticated;
grant execute on function public.push_prune(text, text[], text[]) to anon, authenticated;

-- ทุกแจ้งเตือนใหม่ในเมนูงาน (ถูกมอบหมาย, ถูก @, ตรวจรับ/ตีกลับ ฯลฯ) → ส่ง push ไปทุกเครื่องของคนนั้น
create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_subs jsonb; v_url text; v_endpoint text := public.secret_of('push_endpoint'); v_secret text := public.secret_of('push_dispatch_secret');
begin
  if v_endpoint is null or v_secret is null then return new; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into v_subs from public.push_subscriptions where user_id = new.user_id;
  if v_subs is null then return new; end if;
  v_url := case when new.task_id is not null then '/work/tasks/' || new.task_id
                when new.room_id is not null then '/work/rooms/' || (select key from public.work_rooms where id = new.room_id) || '?tab=chat'
                else '/work/notifications' end;
  perform net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('secret', v_secret, 'subscriptions', v_subs, 'title', 'PKM ERP', 'body', new.message, 'url', v_url, 'tag', coalesce(new.task_id, new.room_id, new.id)::text),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000);
  return new;
exception when others then
  return new;   -- ส่ง push ไม่ได้ ห้ามทำให้แจ้งเตือนในระบบหาย
end $$;
drop trigger if exists work_notifications_push on public.work_notifications;
create trigger work_notifications_push after insert on public.work_notifications for each row execute function public.push_on_notification();

-- ---------------------------------------------------------------------
-- (2) Claude อ่านข้อมูลงาน (อ่านอย่างเดียว) — ทุกฟังก์ชันต้องใส่ token ที่ตรงกับ app_secrets.claude_token
-- ---------------------------------------------------------------------
create or replace function public.claude_ok(p_token text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 16 or p_token is distinct from public.secret_of('claude_token') then raise exception 'unauthorized'; end if;
end $$;

create or replace function public.claude_people(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.claude_ok(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', coalesce(e.nickname, e.first_name), 'full_name', e.first_name || coalesce(' ' || e.last_name, ''), 'team', t.abbrev, 'position', e.position,
      'rooms', (select jsonb_agg(r.name || case when m.is_lead then ' (หัวหน้า)' else '' end order by r.sort_order) from public.work_room_members m join public.work_rooms r on r.id = m.room_id where m.employee_id = e.id))
      order by t.abbrev nulls last, e.emp_code)
    from public.employees e left join public.teams t on t.id = e.team_id where e.status::text <> 'resigned'), '[]'::jsonb)
  || coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(u.display_name, u.email), 'team', 'ผู้บริหาร')) from public.app_users u where u.role::text = 'admin'), '[]'::jsonb);
end $$;

create or replace function public.claude_rooms(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name, 'description', r.description,
      'members', (select jsonb_agg(coalesce(e.nickname, e.first_name) || case when m.is_lead then ' ★' else '' end) from public.work_room_members m join public.employees e on e.id = m.employee_id where m.room_id = r.id),
      'open_tasks', (select count(*) from public.work_tasks t where t.room_id = r.id and t.status::text not in ('accepted', 'cancelled')),
      'messages_last_7d', (select count(*) from public.work_room_messages x where x.room_id = r.id and x.created_at > now() - interval '7 days'))
    order by r.sort_order) from public.work_rooms r where r.is_active), '[]'::jsonb);
end $$;

create or replace function public.claude_room_chat(p_token text, p_room text, p_from timestamptz, p_to timestamptz, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_room uuid;
begin
  perform public.claude_ok(p_token);
  select id into v_room from public.work_rooms where key = p_room or lower(name) = lower(p_room) limit 1;
  if v_room is null then raise exception 'ไม่พบห้อง %', p_room; end if;
  return coalesce((select jsonb_agg(x order by x->>'at') from (
    select jsonb_build_object('at', to_char(m.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'),
      'from', coalesce(u.display_name, u.email), 'text', m.body,
      'attachment', case when m.image_url is not null then 'รูปภาพ' when m.file_url is not null then 'ไฟล์: ' || coalesce(m.file_name, '') end,
      'reply_to', (select left(coalesce(q.body, ''), 80) from public.work_room_messages q where q.id = m.reply_to),
      'task_no', (select t.task_no from public.work_tasks t where t.id = m.task_id)) as x
    from public.work_room_messages m left join public.app_users u on u.id = m.author_id
    where m.room_id = v_room and m.created_at >= coalesce(p_from, now() - interval '1 day') and m.created_at < coalesce(p_to, now() + interval '1 minute')
    order by m.created_at desc limit least(coalesce(p_limit, 300), 1000)) s), '[]'::jsonb);
end $$;

create or replace function public.claude_tasks(p_token text, p_room text, p_status text, p_person text, p_overdue boolean, p_from date, p_to date, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('task_no', t.task_no, 'title', t.title, 'room', r.name, 'status', t.status, 'priority', t.priority,
      'assignee', coalesce(e.nickname, e.first_name), 'ordered_by', coalesce(cu.display_name, cu.email),
      'start', t.start_date, 'due', t.due_date, 'due_time', to_char(t.due_time, 'HH24:MI'),
      'overdue', t.due_date < v_today and t.status::text not in ('accepted', 'cancelled', 'done'),
      'routine', t.routine_id is not null, 'topic', tp.name,
      'checklist_done', (select count(*) filter (where c.is_done) || '/' || count(*) from public.work_checklist c where c.task_id = t.id)) as x
    from public.work_tasks t join public.work_rooms r on r.id = t.room_id
      left join public.employees e on e.id = t.assignee_id left join public.app_users cu on cu.id = t.created_by left join public.work_topics tp on tp.id = t.topic_id
    where (p_room is null or r.key = p_room or lower(r.name) = lower(p_room))
      and (case when p_status is null or p_status = 'open' then t.status::text not in ('accepted', 'cancelled') when p_status = 'all' then true else t.status::text = p_status end)
      and (p_person is null or e.first_name ilike '%' || p_person || '%' or e.nickname ilike '%' || p_person || '%')
      and (not coalesce(p_overdue, false) or (t.due_date < v_today and t.status::text not in ('accepted', 'cancelled', 'done')))
      and (p_from is null or coalesce(t.start_date, t.due_date) >= p_from) and (p_to is null or coalesce(t.start_date, t.due_date) <= p_to)
    order by t.due_date nulls last, t.task_no limit least(coalesce(p_limit, 200), 500)) s), '[]'::jsonb);
end $$;

create or replace function public.claude_task(p_token text, p_task_no int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.work_tasks;
begin
  perform public.claude_ok(p_token);
  select * into t from public.work_tasks where task_no = p_task_no;
  if t.id is null then raise exception 'ไม่พบงาน #%', p_task_no; end if;
  return jsonb_build_object('task_no', t.task_no, 'title', t.title, 'description', t.description, 'status', t.status, 'priority', t.priority,
    'room', (select name from public.work_rooms where id = t.room_id),
    'assignee', (select coalesce(nickname, first_name) from public.employees where id = t.assignee_id),
    'ordered_by', (select coalesce(display_name, email) from public.app_users where id = t.created_by),
    'created', to_char(t.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'), 'start', t.start_date, 'due', t.due_date,
    'done_note', t.done_note, 'review_note', t.review_note,
    'checklist', (select jsonb_agg(jsonb_build_object('item', c.label, 'done', c.is_done) order by c.sort_order) from public.work_checklist c where c.task_id = t.id),
    'comments', (select jsonb_agg(jsonb_build_object('at', to_char(c.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'), 'from', coalesce(u.display_name, u.email), 'text', c.body,
                   'attachment', case when c.image_url is not null then 'รูปภาพ' when c.file_url is not null then 'ไฟล์' end) order by c.created_at)
                 from public.work_comments c left join public.app_users u on u.id = c.author_id where c.task_id = t.id));
end $$;

create or replace function public.claude_calendar(p_token text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'type', c.name, 'start', e.start_date, 'end', e.end_date,
      'time', to_char(e.start_time, 'HH24:MI'), 'location', e.location, 'note', e.note, 'repeat', e.recur, 'repeat_until', e.recur_until) order by e.start_date)
    from public.company_events e left join public.event_categories c on c.id = e.category_id
    where (e.start_date <= p_to and e.end_date >= p_from) or (e.recur is not null and e.start_date <= p_to and (e.recur_until is null or e.recur_until >= p_from))), '[]'::jsonb);
end $$;

create or replace function public.claude_deliveries(p_token text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('store', s.name, 'week_start', d.week_start, 'target_date', d.target_date, 'step', d.step, 'doc_no', d.doc_no, 'po_no', d.po_no,
      'assignee', (select coalesce(nickname, first_name) from public.employees where id = d.assignee_id), 'note', d.note,
      'task_no', (select task_no from public.work_tasks where id = d.task_id)) order by d.week_start, s.sort_order)
    from public.store_deliveries d join public.delivery_stores s on s.id = d.store_id
    where d.week_start between coalesce(p_from, current_date - 14) and coalesce(p_to, current_date + 28)), '[]'::jsonb);
end $$;

create or replace function public.claude_notes(p_token text, p_room text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('title', n.title, 'text', n.body, 'pinned', n.pinned, 'updated', to_char(n.updated_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD'),
      'files', (select count(*) from public.work_note_files f where f.note_id = n.id)) order by n.pinned desc, n.updated_at desc)
    from public.work_notes n join public.work_rooms r on r.id = n.room_id where r.key = p_room or lower(r.name) = lower(p_room)), '[]'::jsonb);
end $$;

grant execute on function public.claude_people(text), public.claude_rooms(text), public.claude_room_chat(text, text, timestamptz, timestamptz, int),
  public.claude_tasks(text, text, text, text, boolean, date, date, int), public.claude_task(text, int), public.claude_calendar(text, date, date),
  public.claude_deliveries(text, date, date), public.claude_notes(text, text) to anon, authenticated;

-- ปุ่ม "ส่งทดสอบ" ในหน้าแจ้งเตือน: สร้างแจ้งเตือนให้ตัวเอง → trigger ส่ง push จริง
create or replace function public.push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.work_notifications (user_id, message) values (public.current_app_user_id(), 'ทดสอบแจ้งเตือน — ถ้าเห็นข้อความนี้เด้งขึ้นมา แปลว่าเครื่องนี้พร้อมแล้ว');
end $$;
grant execute on function public.push_test() to authenticated;
