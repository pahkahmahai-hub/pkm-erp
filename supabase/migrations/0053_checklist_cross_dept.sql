-- 0053: มอบหมายข้อในเช็คลิสต์ให้คนนอกห้อง (แผนกอื่น) ได้
-- คนที่ได้รับมอบหมาย (งาน / ผู้ร่วมงาน / ข้อในเช็คลิสต์) เปิดดูงานนั้น ติ๊กเช็คลิสต์ มอบหมายต่อ และคอมเมนต์ได้ แม้ไม่ได้อยู่ในห้อง
create or replace function public.can_see_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_tasks t
     where t.id = p_task
       and (public.is_room_member(t.room_id)
            or (public.my_employee_id() is not null and (t.assignee_id = public.my_employee_id() or public.my_employee_id() = any(coalesce(t.co_assignee_ids, '{}'))))
            or exists (select 1 from public.work_checklist c where c.task_id = t.id and c.assignee_id = public.my_employee_id())));
$$;
grant execute on function public.can_see_task(uuid) to authenticated;

drop policy if exists "tasks read" on public.work_tasks;
create policy "tasks read" on public.work_tasks for select to authenticated using (public.can_see_task(id));

drop policy if exists "checklist read" on public.work_checklist;
drop policy if exists "checklist write" on public.work_checklist;
create policy "checklist read"  on public.work_checklist for select to authenticated using (public.can_see_task(task_id));
create policy "checklist write" on public.work_checklist for all to authenticated using (public.can_see_task(task_id)) with check (public.can_see_task(task_id));

drop policy if exists "comments read" on public.work_comments;
create policy "comments read" on public.work_comments for select to authenticated using (public.can_see_task(task_id));

drop policy if exists "task files read" on public.work_task_files;
create policy "task files read" on public.work_task_files for select to authenticated using (public.can_see_task(task_id));

create or replace function public.add_comment(p_task uuid, p_body text, p_image_url text default null, p_file_url text default null, p_file_name text default null)
returns public.work_comments
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_c public.work_comments; v_me uuid := public.current_app_user_id(); v_name text;
begin
  select * into v_t from public.work_tasks where id = p_task;
  if v_t.id is null or not public.can_see_task(v_t.id) then raise exception 'ไม่มีสิทธิ์'; end if;
  if coalesce(trim(p_body), '') = '' and p_image_url is null and p_file_url is null then raise exception 'ข้อความว่าง'; end if;
  insert into public.work_comments (task_id, author_id, body, image_url, file_url, file_name)
  values (p_task, v_me, nullif(trim(p_body), ''), p_image_url, p_file_url, p_file_name) returning * into v_c;
  select coalesce(display_name, email) into v_name from public.app_users where id = v_me;
  perform public.notify_user(v_t.created_by, p_task, v_name || ' คอมเมนต์ใน: ' || v_t.title);
  perform public.notify_user(public.user_id_of_employee(v_t.assignee_id), p_task, v_name || ' คอมเมนต์ใน: ' || v_t.title);
  return v_c;
end $$;
