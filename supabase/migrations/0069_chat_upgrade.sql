-- 0069: อัปเกรดแชทให้ใกล้ไลน์
--   (1) ผู้บริหารดูได้ว่าใครเปิดแจ้งเตือนเด้งแล้วกี่เครื่อง
--   (2) ถูก @ → เด้งแบบเด่น (หัวข้อ 🔔 · ค้างบนจอ) · ปิดเสียงรายห้องได้ (ถูก @ ยังเด้งเสมอ)
--   (3) กดแจ้งเตือน → ไปที่ข้อความนั้นเลย (#msg-…)
--   (4) หน้า "เรียกฉัน" — ใช้ work_notifications.kind = 'mention'
--   (6) แก้ไขข้อความ · ปักหมุด · กดอีโมจิ (ต่อยอดจากปุ่มรับทราบ 0065)

-- ---------------------------------------------------------------------
-- แจ้งเตือน: ประเภท + ลิงก์ตรงไปที่ข้อความ
-- ---------------------------------------------------------------------
alter table public.work_notifications add column if not exists kind text;   -- 'mention' | null
alter table public.work_notifications add column if not exists link text;   -- ลิงก์ตรง เช่น /work/rooms/office?tab=chat#msg-…
create index if not exists work_notifications_user_kind on public.work_notifications (user_id, kind, created_at desc);
-- ของเก่า: แจ้งเตือน @ ที่มีอยู่แล้ว
update public.work_notifications set kind = 'mention' where kind is null and message like '%เอ่ยถึงคุณ%';

create or replace function public.notify_mentions(p_message uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m public.work_room_messages; v_emp uuid; v_user uuid; v_room public.work_rooms; v_author text; n int := 0; v_done uuid[] := '{}';
begin
  select * into m from public.work_room_messages where id = p_message;
  if m.id is null or coalesce(array_length(m.mentions, 1), 0) = 0 then return 0; end if;
  select * into v_room from public.work_rooms where id = m.room_id;
  select coalesce(display_name, email) into v_author from public.app_users where id = m.author_id;
  foreach v_emp in array m.mentions loop
    v_user := coalesce(public.user_id_of_employee(v_emp), (select id from public.app_users where id = v_emp and is_active));
    if v_user is not null and v_user <> m.author_id and not (v_user = any(v_done)) then
      insert into public.work_notifications (user_id, task_id, room_id, message, kind, link)
      values (v_user, null, m.room_id, format('%s เอ่ยถึงคุณในห้อง %s: %s', v_author, v_room.name, left(coalesce(m.body, '(รูป/ไฟล์)'), 120)),
              'mention', '/work/rooms/' || v_room.key || '?tab=chat#msg-' || m.id);
      v_done := v_done || v_user;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.notify_comment_mentions(p_comment uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare c public.work_comments; t public.work_tasks; v_id uuid; v_user uuid; v_author text; n int := 0; v_done uuid[] := '{}';
begin
  select * into c from public.work_comments where id = p_comment;
  if c.id is null or c.author_id is distinct from public.current_app_user_id() then return 0; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  update public.work_comments set mentions = p_ids where id = p_comment;
  select * into t from public.work_tasks where id = c.task_id;
  select coalesce(display_name, email) into v_author from public.app_users where id = c.author_id;
  foreach v_id in array p_ids loop
    v_user := coalesce(public.user_id_of_employee(v_id), (select id from public.app_users where id = v_id and is_active));
    if v_user is not null and v_user <> c.author_id and not (v_user = any(v_done)) then
      insert into public.work_notifications (user_id, task_id, message, kind, link)
      values (v_user, c.task_id, format('%s เอ่ยถึงคุณในงาน #%s %s: %s', v_author, t.task_no, t.title, left(coalesce(c.body, '(รูป/ไฟล์)'), 120)),
              'mention', '/work/tasks/' || c.task_id || '#msg-' || c.id);
      v_done := v_done || v_user; n := n + 1;
    end if;
  end loop;
  return n;
end $$;
grant execute on function public.notify_comment_mentions(uuid, uuid[]) to authenticated;

-- push ของแจ้งเตือน: @ = หัวข้อ 🔔 + urgent (ค้างบนจอจนกด) · ส่งจำนวนที่ยังไม่อ่านไปทำเลขบนไอคอนแอป
create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_subs jsonb; v_url text; v_endpoint text := public.secret_of('push_endpoint'); v_secret text := public.secret_of('push_dispatch_secret'); v_badge int;
begin
  if v_endpoint is null or v_secret is null then return new; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into v_subs from public.push_subscriptions where user_id = new.user_id;
  if v_subs is null then return new; end if;
  v_url := coalesce(new.link,
                    case when new.task_id is not null then '/work/tasks/' || new.task_id
                         when new.room_id is not null then '/work/rooms/' || (select key from public.work_rooms where id = new.room_id) || '?tab=chat'
                         else '/work/notifications' end);
  select count(*) into v_badge from public.work_notifications where user_id = new.user_id and read_at is null;
  perform net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('secret', v_secret, 'subscriptions', v_subs,
      'title', case when new.kind = 'mention' then '🔔 มีคนเรียกคุณ' else 'PKM ERP' end,
      'body', new.message, 'url', v_url, 'badge', v_badge, 'urgent', new.kind = 'mention',
      'tag', case when new.kind = 'mention' then 'mention-' || new.id else coalesce(new.task_id, new.room_id, new.id)::text end),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000);
  return new;
exception when others then
  return new;
end $$;

-- ---------------------------------------------------------------------
-- push ของข้อความทั่วไป: ลิงก์ไปที่ข้อความ + ข้ามคนที่ปิดเสียงห้อง
-- ---------------------------------------------------------------------
create table if not exists public.work_room_mutes (
  user_id    uuid not null references public.app_users(id) on delete cascade,
  room_id    uuid not null references public.work_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
alter table public.work_room_mutes enable row level security;
drop policy if exists "mutes own" on public.work_room_mutes;
create policy "mutes own" on public.work_room_mutes for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

create or replace function public.toggle_room_mute(p_room uuid) returns boolean   -- คืน true = ปิดเสียงอยู่
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_app_user_id();
begin
  if v_me is null then raise exception 'ไม่มีสิทธิ์'; end if;
  if exists (select 1 from public.work_room_mutes where user_id = v_me and room_id = p_room) then
    delete from public.work_room_mutes where user_id = v_me and room_id = p_room; return false;
  end if;
  insert into public.work_room_mutes (user_id, room_id) values (v_me, p_room); return true;
end $$;
grant execute on function public.toggle_room_mute(uuid) to authenticated;

create or replace function public.push_on_room_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_room public.work_rooms; v_users uuid[]; v_author text; v_mentioned uuid[];
begin
  select * into v_room from public.work_rooms where id = new.room_id;
  select array_agg(coalesce(public.user_id_of_employee(x), x)) into v_mentioned from unnest(coalesce(new.mentions, '{}')) x;
  select array_agg(distinct u.id) into v_users
    from public.app_users u
   where u.is_active and u.id is distinct from new.author_id and not (u.id = any(coalesce(v_mentioned, '{}')))
     and not exists (select 1 from public.work_room_mutes mu where mu.user_id = u.id and mu.room_id = new.room_id)
     and (u.role = 'admin'
          or u.employee_id in (select m.employee_id from public.work_room_members m where m.room_id = new.room_id)
          or u.employee_id in (select m.employee_id from public.work_room_members m join public.work_rooms p on p.id = m.room_id
                                where p.key = v_room.parent_key and m.is_lead));
  select coalesce((select coalesce(nullif(e.nickname, ''), e.first_name) from public.employees e where e.id = a.employee_id), a.display_name, split_part(a.email, '@', 1))
    into v_author from public.app_users a where a.id = new.author_id;
  perform public.push_to_users(v_users, format('💬 %s · %s', coalesce(v_author, ''), v_room.name),
    left(coalesce(nullif(new.body, ''), case when new.image_url is not null then '📷 รูปภาพ' else '📎 ไฟล์' end), 160),
    '/work/rooms/' || v_room.key || '?tab=chat#msg-' || new.id, new.room_id::text);
  return new;
exception when others then
  return new;
end $$;

-- คอมเมนต์ในงาน: คนที่ปิดเสียงห้องของงานนั้น จะไม่เด้ง — ยกเว้นเป็นผู้รับงาน / ผู้ร่วมงาน / ผู้สั่ง / ผู้รับผิดชอบรายข้อ
create or replace function public.push_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_users uuid[]; v_author text; v_mentioned uuid[];
begin
  if coalesce(new.kind, 'comment') <> 'comment' then return new; end if;
  select * into t from public.work_tasks where id = new.task_id;
  select array_agg(coalesce(public.user_id_of_employee(x), x)) into v_mentioned from unnest(coalesce(new.mentions, '{}')) x;
  select array_agg(distinct u.id) into v_users
    from public.app_users u
   where u.is_active and u.id is distinct from new.author_id and not (u.id = any(coalesce(v_mentioned, '{}')))
     and (u.employee_id = t.assignee_id
          or u.employee_id = any(coalesce(t.co_assignee_ids, '{}'))
          or u.id = t.created_by
          or u.employee_id in (select c.assignee_id from public.work_checklist c where c.task_id = t.id)
          or u.id in (select c.assignee_user_id from public.work_checklist c where c.task_id = t.id)
          or ((u.role = 'admin' or u.employee_id in (select m.employee_id from public.work_room_members m where m.room_id = t.room_id))
              and not exists (select 1 from public.work_room_mutes mu where mu.user_id = u.id and mu.room_id = t.room_id)));
  select coalesce((select coalesce(nullif(e.nickname, ''), e.first_name) from public.employees e where e.id = a.employee_id), a.display_name, split_part(a.email, '@', 1))
    into v_author from public.app_users a where a.id = new.author_id;
  perform public.push_to_users(v_users, format('💬 %s · #%s %s', coalesce(v_author, ''), t.task_no, left(t.title, 40)),
    left(coalesce(nullif(new.body, ''), case when new.image_url is not null then '📷 รูปภาพ' else '📎 ไฟล์' end), 160),
    '/work/tasks/' || t.id || '#msg-' || new.id, t.id::text);
  return new;
exception when others then
  return new;
end $$;

-- ---------------------------------------------------------------------
-- (1) ใครเปิดแจ้งเตือนแล้วบ้าง — ผู้บริหารเท่านั้น
-- ---------------------------------------------------------------------
create or replace function public.push_team_status()
returns table (user_id uuid, name text, is_admin boolean, devices int, agents text[], last_ok_at timestamptz, last_added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้บริหาร'; end if;
  return query
  select u.id,
         coalesce(nullif(e.nickname, ''), e.first_name, nullif(u.display_name, ''), split_part(u.email, '@', 1)),
         u.role = 'admin',
         count(s.id)::int,
         coalesce(array_agg(s.user_agent) filter (where s.id is not null), '{}'),
         max(s.last_ok_at), max(s.created_at)
    from public.app_users u
    left join public.employees e on e.id = u.employee_id
    left join public.push_subscriptions s on s.user_id = u.id
   where u.is_active and (u.employee_id is not null or u.role = 'admin')
   group by u.id, e.nickname, e.first_name, u.display_name, u.email, u.role
   order by count(s.id), 2;
end $$;
grant execute on function public.push_team_status() to authenticated;

-- ---------------------------------------------------------------------
-- (6) แก้ไขข้อความ (เจ้าของข้อความเท่านั้น)
-- ---------------------------------------------------------------------
alter table public.work_room_messages add column if not exists edited_at timestamptz;
alter table public.work_comments      add column if not exists edited_at timestamptz;

create or replace function public.edit_message(p_kind text, p_msg uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_app_user_id(); v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if p_kind = 'room' then
    if not exists (select 1 from public.work_room_messages where id = p_msg and author_id = v_me) then raise exception 'แก้ได้เฉพาะข้อความของตัวเอง'; end if;
    if v_body is null and exists (select 1 from public.work_room_messages where id = p_msg and image_url is null and file_url is null) then raise exception 'ข้อความว่างไม่ได้ — ถ้าไม่ต้องการแล้วให้กดยกเลิกส่ง'; end if;
    update public.work_room_messages set body = v_body, edited_at = now() where id = p_msg;
  elsif p_kind = 'comment' then
    if not exists (select 1 from public.work_comments where id = p_msg and author_id = v_me and coalesce(kind, 'comment') = 'comment') then raise exception 'แก้ได้เฉพาะข้อความของตัวเอง'; end if;
    if v_body is null and exists (select 1 from public.work_comments where id = p_msg and image_url is null and file_url is null) then raise exception 'ข้อความว่างไม่ได้ — ถ้าไม่ต้องการแล้วให้กดยกเลิกส่ง'; end if;
    update public.work_comments set body = v_body, edited_at = now() where id = p_msg;
  else raise exception 'bad kind'; end if;
end $$;
grant execute on function public.edit_message(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (6) ปักหมุดข้อความในห้อง (เจ้าของข้อความ · หัวหน้าห้อง · ผู้บริหาร)
-- ---------------------------------------------------------------------
alter table public.work_room_messages add column if not exists pinned_at timestamptz;
alter table public.work_room_messages add column if not exists pinned_by uuid references public.app_users(id) on delete set null;
create index if not exists work_room_messages_pinned on public.work_room_messages (room_id, pinned_at desc) where pinned_at is not null;

create or replace function public.pin_message(p_msg uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m public.work_room_messages; v_me uuid := public.current_app_user_id();
begin
  select * into m from public.work_room_messages where id = p_msg;
  if m.id is null or not public.is_room_member(m.room_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if not (public.is_admin() or m.author_id = v_me or public.is_room_lead(m.room_id)) then raise exception 'ปักหมุดได้เฉพาะเจ้าของข้อความ หัวหน้าห้อง หรือผู้บริหาร'; end if;
  update public.work_room_messages set pinned_at = case when p_on then now() end, pinned_by = case when p_on then v_me end where id = p_msg;
end $$;
grant execute on function public.pin_message(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- (6) อีโมจิ — ใช้ตารางรับทราบเดิม เพิ่มคอลัมน์ emoji ('👍' = รับทราบ)
-- ---------------------------------------------------------------------
alter table public.work_message_acks add column if not exists emoji text not null default '👍';
alter table public.work_message_acks drop constraint if exists work_message_acks_pkey;
alter table public.work_message_acks add primary key (kind, message_id, user_id, emoji);

create or replace function public.toggle_reaction(p_kind text, p_msg uuid, p_emoji text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_app_user_id(); v_e text := coalesce(nullif(trim(p_emoji), ''), '👍');
begin
  if v_me is null or not public.msg_visible(p_kind, p_msg) then raise exception 'ไม่มีสิทธิ์'; end if;
  if length(v_e) > 16 then raise exception 'bad emoji'; end if;
  if exists (select 1 from public.work_message_acks where kind = p_kind and message_id = p_msg and user_id = v_me and emoji = v_e) then
    delete from public.work_message_acks where kind = p_kind and message_id = p_msg and user_id = v_me and emoji = v_e;
    return false;
  end if;
  insert into public.work_message_acks (kind, message_id, user_id, emoji) values (p_kind, p_msg, v_me, v_e);
  return true;
end $$;
grant execute on function public.toggle_reaction(text, uuid, text) to authenticated;

-- toggle_ack เดิม = รีแอค 👍
create or replace function public.toggle_ack(p_kind text, p_msg uuid) returns boolean
language sql security definer set search_path = public as $$ select public.toggle_reaction(p_kind, p_msg, '👍'); $$;

drop function if exists public.message_acks(text, uuid[]);
create function public.message_acks(p_kind text, p_ids uuid[])
returns table (message_id uuid, user_id uuid, name text, created_at timestamptz, emoji text)
language sql stable security definer set search_path = public as $$
  select a.message_id, a.user_id, coalesce(nullif(e.nickname, ''), e.first_name, u.display_name, split_part(u.email, '@', 1)), a.created_at, a.emoji
    from public.work_message_acks a
    join public.app_users u on u.id = a.user_id
    left join public.employees e on e.id = u.employee_id
   where a.kind = p_kind and a.message_id = any(p_ids) and public.msg_visible(p_kind, a.message_id)
   order by a.created_at;
$$;
grant execute on function public.toggle_ack(text, uuid) to authenticated;
grant execute on function public.message_acks(text, uuid[]) to authenticated;
