-- 0061: ทางลัดแชทห้องในเมนู + จำนวนข้อความที่ยังไม่อ่าน
-- เห็นเฉพาะห้องที่ตัวเองเป็นสมาชิก (ผู้บริหารเห็นทุกห้อง)
create or replace function public.my_room_unread()
returns table (key text, name text, color text, unread int, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public.current_app_user_id() as uid, public.my_employee_id() as emp, public.is_admin() as adm)
  select r.key, r.name, r.color,
         (select count(*)::int from public.work_room_messages m
           where m.room_id = r.id and m.author_id is distinct from me.uid
             and m.created_at > coalesce((select rd.last_read_at from public.work_room_reads rd where rd.room_id = r.id and rd.user_id = me.uid), '-infinity'::timestamptz)),
         (select max(m.created_at) from public.work_room_messages m where m.room_id = r.id)
    from public.work_rooms r, me
   where me.uid is not null
     and (me.adm or exists (select 1 from public.work_room_members x where x.room_id = r.id and x.employee_id = me.emp))
   order by r.sort_order, r.name;
$$;
grant execute on function public.my_room_unread() to authenticated;
