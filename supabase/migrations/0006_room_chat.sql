-- =====================================================================
-- PKM ERP — 0006: แชทประจำห้องงาน
-- Run after 0005
-- =====================================================================

create table public.work_room_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.work_rooms(id) on delete cascade,
  author_id  uuid references public.app_users(id),
  body       text,
  image_url  text,
  file_url   text,
  file_name  text,
  task_id    uuid references public.work_tasks(id) on delete set null,   -- ถ้าข้อความนี้ถูกแปลงเป็นงาน
  created_at timestamptz not null default now()
);
create index on public.work_room_messages (room_id, created_at desc);

alter table public.work_room_messages enable row level security;
create policy "room msg read"   on public.work_room_messages for select to authenticated using (public.is_room_member(room_id));
create policy "room msg insert" on public.work_room_messages for insert to authenticated with check (public.is_room_member(room_id) and author_id = public.current_app_user_id());
create policy "room msg update" on public.work_room_messages for update to authenticated using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));
create policy "room msg delete" on public.work_room_messages for delete to authenticated using (author_id = public.current_app_user_id() or public.is_admin());

alter publication supabase_realtime add table public.work_room_messages;

-- last-read marker per user per room (for unread badges)
create table public.work_room_reads (
  room_id     uuid not null references public.work_rooms(id) on delete cascade,
  user_id     uuid not null references public.app_users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.work_room_reads enable row level security;
create policy "room reads own" on public.work_room_reads for all to authenticated using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

-- unread count per room for the current user
create or replace function public.room_unread_counts()
returns table (room_id uuid, unread int)
language sql stable security definer set search_path = public as $$
  select r.id, count(m.id)::int
    from public.work_rooms r
    left join public.work_room_reads rd on rd.room_id = r.id and rd.user_id = public.current_app_user_id()
    left join public.work_room_messages m on m.room_id = r.id and m.author_id is distinct from public.current_app_user_id()
         and m.created_at > coalesce(rd.last_read_at, '1970-01-01')
   where public.is_room_member(r.id)
   group by r.id;
$$;
