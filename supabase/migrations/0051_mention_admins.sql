-- 0051: @เอ่ยถึงผู้บริหารในแชทห้องได้ (แม้ไม่มีประวัติพนักงาน)
-- รายชื่อผู้บริหารสำหรับ @ (พนักงานอ่าน app_users ของคนอื่นไม่ได้ จึงเปิดผ่านฟังก์ชันนี้ — ไม่ส่งอีเมลออกไป)
create or replace function public.mentionable_admins()
returns table (user_id uuid, employee_id uuid, label text)
language sql stable security definer set search_path = public as $$
  select u.id, u.employee_id,
         coalesce(nullif(trim(u.display_name), ''), split_part(u.email, '@', 1))
    from public.app_users u
   where u.role = 'admin' and u.is_active and auth.uid() is not null
   order by u.created_at;
$$;
grant execute on function public.mentionable_admins() to authenticated;

-- mentions เก็บได้ทั้ง employee id และ app_user id (ผู้บริหารที่ไม่มีประวัติพนักงาน)
create or replace function public.notify_mentions(p_message uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m public.work_room_messages; v_emp uuid; v_user uuid; v_room text; v_author text; n int := 0; v_done uuid[] := '{}';
begin
  select * into m from public.work_room_messages where id = p_message;
  if m.id is null or coalesce(array_length(m.mentions, 1), 0) = 0 then return 0; end if;
  select name into v_room from public.work_rooms where id = m.room_id;
  select coalesce(display_name, email) into v_author from public.app_users where id = m.author_id;
  foreach v_emp in array m.mentions loop
    v_user := coalesce(public.user_id_of_employee(v_emp), (select id from public.app_users where id = v_emp and is_active));
    if v_user is not null and v_user <> m.author_id and not (v_user = any(v_done)) then
      insert into public.work_notifications (user_id, task_id, room_id, message) values (v_user, null, m.room_id, format('%s เอ่ยถึงคุณในห้อง %s: %s', v_author, v_room, left(coalesce(m.body, '(รูป/ไฟล์)'), 120)));
      v_done := v_done || v_user;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
