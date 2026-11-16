-- 0054: @เอ่ยถึงคนในคอมเมนต์ของงาน → แจ้งเตือน (ลิงก์ไปที่งาน)
alter table public.work_comments add column if not exists mentions uuid[] not null default '{}';   -- employee id หรือ app_user id (ผู้บริหาร)

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
      insert into public.work_notifications (user_id, task_id, message)
      values (v_user, c.task_id, format('%s เอ่ยถึงคุณในงาน #%s %s: %s', v_author, t.task_no, t.title, left(coalesce(c.body, '(รูป/ไฟล์)'), 120)));
      v_done := v_done || v_user; n := n + 1;
    end if;
  end loop;
  return n;
end $$;
grant execute on function public.notify_comment_mentions(uuid, uuid[]) to authenticated;
