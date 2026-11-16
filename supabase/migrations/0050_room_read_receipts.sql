-- 0050: ดูว่าใครอ่านแชทห้องแล้วบ้าง (อ่านถึงเวลาไหน) — เฉพาะคนที่เข้าห้องนั้นได้
create or replace function public.room_read_status(p_room uuid)
returns table (user_id uuid, name text, last_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rd.user_id,
         coalesce(nullif(e.nickname, ''), e.first_name, u.display_name, split_part(u.email, '@', 1)) as name,
         rd.last_read_at
    from public.work_room_reads rd
    join public.app_users u on u.id = rd.user_id
    left join public.employees e on e.id = u.employee_id
   where rd.room_id = p_room and public.is_room_member(p_room)
   order by rd.last_read_at desc;
$$;
grant execute on function public.room_read_status(uuid) to authenticated;
