-- 0065: ปุ่ม "รับทราบ" ในแชทห้อง / คอมเมนต์ในงาน (ไม่ต้องพิมพ์)
create table if not exists public.work_message_acks (
  kind       text not null check (kind in ('room', 'comment')),
  message_id uuid not null,
  user_id    uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, message_id, user_id)
);
alter table public.work_message_acks enable row level security;   -- เข้าถึงผ่านฟังก์ชันด้านล่างเท่านั้น

create or replace function public.msg_visible(p_kind text, p_msg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'room' then exists (select 1 from public.work_room_messages m where m.id = p_msg and public.is_room_member(m.room_id))
    when 'comment' then exists (select 1 from public.work_comments c where c.id = p_msg and public.can_see_task(c.task_id))
    else false end;
$$;

-- กดรับทราบ / ยกเลิก (คืน true = รับทราบอยู่)
create or replace function public.toggle_ack(p_kind text, p_msg uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.current_app_user_id();
begin
  if v_me is null or not public.msg_visible(p_kind, p_msg) then raise exception 'ไม่มีสิทธิ์'; end if;
  if exists (select 1 from public.work_message_acks where kind = p_kind and message_id = p_msg and user_id = v_me) then
    delete from public.work_message_acks where kind = p_kind and message_id = p_msg and user_id = v_me;
    return false;
  end if;
  insert into public.work_message_acks (kind, message_id, user_id) values (p_kind, p_msg, v_me);
  return true;
end $$;

-- ใครรับทราบข้อความไหนบ้าง
create or replace function public.message_acks(p_kind text, p_ids uuid[])
returns table (message_id uuid, user_id uuid, name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.message_id, a.user_id, coalesce(nullif(e.nickname, ''), e.first_name, u.display_name, split_part(u.email, '@', 1)), a.created_at
    from public.work_message_acks a
    join public.app_users u on u.id = a.user_id
    left join public.employees e on e.id = u.employee_id
   where a.kind = p_kind and a.message_id = any(p_ids) and public.msg_visible(p_kind, a.message_id)
   order by a.created_at;
$$;
grant execute on function public.toggle_ack(text, uuid) to authenticated;
grant execute on function public.message_acks(text, uuid[]) to authenticated;
