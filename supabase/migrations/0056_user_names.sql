-- 0056: ชื่อผู้ใช้สำหรับแสดงในแชท/คอมเมนต์ (พนักงานอ่าน app_users ของคนอื่นไม่ได้ → ชื่อคนส่งหาย)
-- ส่งเฉพาะ id + ชื่อเล่น/ชื่อ (ไม่มีอีเมล)
create or replace function public.user_names()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(e.nickname, ''), e.first_name, nullif(u.display_name, ''), split_part(u.email, '@', 1))
    from public.app_users u
    left join public.employees e on e.id = u.employee_id
   where auth.uid() is not null;
$$;
grant execute on function public.user_names() to authenticated;
