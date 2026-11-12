-- =====================================================================
-- PKM ERP — 0025: ทุกห้องในเมนูงาน มี "โน้ต" (ข้อความ + รูป) และ "แกลเลอรี" (อัลบั้มรูป)
--   สมาชิกห้องอ่าน/เพิ่มได้ · แก้/ลบโน้ตหรืออัลบั้ม = เจ้าของ, หัวหน้าห้อง ★, ผู้บริหาร
-- =====================================================================
create table public.work_notes (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.work_rooms(id) on delete cascade,
  title       text not null,
  body        text,
  color       text not null default '#fff8e6',
  pinned      boolean not null default false,
  created_by  uuid references public.app_users(id) default public.current_app_user_id(),
  updated_by  uuid references public.app_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.work_notes (room_id, pinned desc, updated_at desc);

create table public.work_note_files (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.work_notes(id) on delete cascade,
  url         text not null,
  name        text,
  is_image    boolean not null default true,
  sort_order  int not null default 0,
  created_by  uuid references public.app_users(id) default public.current_app_user_id(),
  created_at  timestamptz not null default now()
);
create index on public.work_note_files (note_id, sort_order);

create table public.work_albums (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.work_rooms(id) on delete cascade,
  title       text not null,
  description text,
  event_date  date,
  cover_url   text,
  created_by  uuid references public.app_users(id) default public.current_app_user_id(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.work_albums (room_id, created_at desc);

create table public.work_album_photos (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.work_albums(id) on delete cascade,
  url         text not null,
  caption     text,
  sort_order  int not null default 0,
  created_by  uuid references public.app_users(id) default public.current_app_user_id(),
  created_at  timestamptz not null default now()
);
create index on public.work_album_photos (album_id, sort_order, created_at);

-- ผู้ดูแลรายการ: เจ้าของ / หัวหน้าห้อง / ผู้บริหาร
create or replace function public.can_manage_room_item(p_room uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or p_owner = public.current_app_user_id() or public.is_room_lead(p_room);
$$;

alter table public.work_notes enable row level security;
alter table public.work_note_files enable row level security;
alter table public.work_albums enable row level security;
alter table public.work_album_photos enable row level security;

create policy "notes read"   on public.work_notes for select to authenticated using (public.is_room_member(room_id));
create policy "notes insert" on public.work_notes for insert to authenticated with check (public.is_room_member(room_id));
create policy "notes update" on public.work_notes for update to authenticated using (public.can_manage_room_item(room_id, created_by));
create policy "notes delete" on public.work_notes for delete to authenticated using (public.can_manage_room_item(room_id, created_by));

create policy "note files read"   on public.work_note_files for select to authenticated using (exists (select 1 from public.work_notes n where n.id = note_id and public.is_room_member(n.room_id)));
create policy "note files insert" on public.work_note_files for insert to authenticated with check (exists (select 1 from public.work_notes n where n.id = note_id and public.can_manage_room_item(n.room_id, n.created_by)));
create policy "note files delete" on public.work_note_files for delete to authenticated using (exists (select 1 from public.work_notes n where n.id = note_id and public.can_manage_room_item(n.room_id, n.created_by)));

create policy "albums read"   on public.work_albums for select to authenticated using (public.is_room_member(room_id));
create policy "albums insert" on public.work_albums for insert to authenticated with check (public.is_room_member(room_id));
create policy "albums update" on public.work_albums for update to authenticated using (public.is_room_member(room_id));   -- ทุกคนในห้องเปลี่ยนรูปปกได้
create policy "albums delete" on public.work_albums for delete to authenticated using (public.can_manage_room_item(room_id, created_by));

create policy "photos read"   on public.work_album_photos for select to authenticated using (exists (select 1 from public.work_albums a where a.id = album_id and public.is_room_member(a.room_id)));
create policy "photos insert" on public.work_album_photos for insert to authenticated with check (exists (select 1 from public.work_albums a where a.id = album_id and public.is_room_member(a.room_id)));
create policy "photos update" on public.work_album_photos for update to authenticated using (exists (select 1 from public.work_albums a where a.id = album_id and public.can_manage_room_item(a.room_id, created_by)));
create policy "photos delete" on public.work_album_photos for delete to authenticated using (exists (select 1 from public.work_albums a where a.id = album_id and (public.can_manage_room_item(a.room_id, created_by) or public.can_manage_room_item(a.room_id, a.created_by))));
