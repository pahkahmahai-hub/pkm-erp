-- =====================================================================
-- PKM ERP — 0017: หัวหน้าห้อง (★) โอนงาน / แก้ไข / ตรวจรับ / ตีกลับ งานของทุกคนในห้องได้
--   ตั้งหัวหน้าห้องได้ที่หน้าห้อง (ผู้บริหารกด ★ หลังชื่อสมาชิก)
-- =====================================================================
create or replace function public.is_room_lead(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.work_room_members where room_id = p_room and employee_id = public.my_employee_id() and is_lead);
$$;

-- หัวหน้าห้องลบงานในห้องได้
drop policy if exists "tasks delete" on public.work_tasks;
create policy "tasks delete" on public.work_tasks for delete to authenticated using (public.is_admin() or created_by = public.current_app_user_id() or public.is_room_lead(room_id));

-- ตั้งหัวหน้าห้องเริ่มต้น: จันทกาญจน์ (SW ROOM), อารดา (GC ROOM)
update public.work_room_members m set is_lead = true
  from public.employees e, public.work_rooms r
 where m.employee_id = e.id and m.room_id = r.id
   and ((r.key = 'sw-room' and e.first_name = 'จันทกาญจน์') or (r.key = 'gc-room' and e.first_name = 'อารดา'));

create or replace function public.set_task_status(p_task uuid, p_status public.task_status, p_note text default null)
returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_me uuid := public.current_app_user_id(); v_my_emp uuid := public.my_employee_id(); v_name text;
begin
  select * into v_t from public.work_tasks where id = p_task;
  if v_t.id is null then raise exception 'ไม่พบงาน'; end if;
  if not public.is_room_member(v_t.room_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  select coalesce(display_name, email) into v_name from public.app_users where id = v_me;

  if p_status in ('in_progress', 'done') then
    -- ผู้รับงาน (หรือ admin / ผู้สั่ง) ทำได้
    if not (public.is_admin() or v_t.assignee_id = v_my_emp or v_t.created_by = v_me or public.is_room_lead(v_t.room_id)) then raise exception 'เฉพาะผู้รับงาน'; end if;
    update public.work_tasks set status = p_status,
      started_at = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
      done_at = case when p_status = 'done' then now() else done_at end,
      done_by = case when p_status = 'done' then v_me else done_by end,
      done_note = case when p_status = 'done' then p_note else done_note end
    where id = p_task returning * into v_t;
    perform public.task_log(p_task, case when p_status = 'done' then 'ทำเสร็จแล้ว' || coalesce(' — ' || p_note, '') else 'เริ่มทำงาน' end);
    if p_status = 'done' then perform public.notify_user(v_t.created_by, p_task, v_name || ' ทำเสร็จ: ' || v_t.title || ' (รอตรวจรับ)'); end if;

  elsif p_status in ('accepted', 'returned', 'cancelled') then
    -- ผู้สั่ง หรือ admin
    if not (public.is_admin() or v_t.created_by = v_me or public.is_room_lead(v_t.room_id)) then raise exception 'เฉพาะผู้สั่งงาน หัวหน้าห้อง หรือผู้ดูแล'; end if;
    update public.work_tasks set status = p_status, reviewed_at = now(), reviewed_by = v_me, review_note = p_note
    where id = p_task returning * into v_t;
    perform public.task_log(p_task, case p_status when 'accepted' then 'ตรวจรับแล้ว ✔' when 'returned' then 'ตีกลับให้แก้' || coalesce(' — ' || p_note, '') else 'ยกเลิกงาน' end);
    perform public.notify_user(public.user_id_of_employee(v_t.assignee_id), p_task,
      case p_status when 'accepted' then 'ตรวจรับแล้ว: ' when 'returned' then 'ตีกลับ: ' else 'ยกเลิก: ' end || v_t.title);
  elsif p_status = 'open' then
    update public.work_tasks set status = 'open' where id = p_task returning * into v_t;
  end if;
  return v_t;
end $$;

