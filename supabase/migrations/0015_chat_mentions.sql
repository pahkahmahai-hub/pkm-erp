-- =====================================================================
-- PKM ERP — 0015: @mention ในห้องแชท + แจ้งเตือนคนที่ถูกเอ่ยถึง + ลิงก์แจ้งเตือนกลับไปห้อง
-- =====================================================================
alter table public.work_room_messages add column if not exists mentions uuid[] not null default '{}';   -- employee ids
alter table public.work_notifications add column if not exists room_id uuid references public.work_rooms(id) on delete cascade;

-- แจ้งเตือนทุกคนที่ถูก @ (ยกเว้นตัวเอง) — เรียกจาก server action หลังโพสต์ข้อความ
create or replace function public.notify_mentions(p_message uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m public.work_room_messages; v_emp uuid; v_user uuid; v_room text; v_author text; n int := 0;
begin
  select * into m from public.work_room_messages where id = p_message;
  if m.id is null or coalesce(array_length(m.mentions, 1), 0) = 0 then return 0; end if;
  select name into v_room from public.work_rooms where id = m.room_id;
  select coalesce(display_name, email) into v_author from public.app_users where id = m.author_id;
  foreach v_emp in array m.mentions loop
    v_user := public.user_id_of_employee(v_emp);
    if v_user is not null and v_user <> m.author_id then
      insert into public.work_notifications (user_id, task_id, room_id, message) values (v_user, null, m.room_id, format('%s เอ่ยถึงคุณในห้อง %s: %s', v_author, v_room, left(coalesce(m.body, '(รูป/ไฟล์)'), 120)));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
