-- =====================================================================
-- PKM ERP — 0019: กติกาตรวจรับงาน
--   หัวหน้าห้อง ★ ตรวจรับ/ตีกลับงานของลูกทีมในห้องได้ (รวมงานประจำที่ระบบสร้าง)
--   งานของตัวเอง (เช่น งานของอารดา / จันทกาญจน์) ต้องให้ผู้บริหาร (ผม/ภรรยา) ตรวจรับ
-- =====================================================================
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
    -- งานของตัวเอง (รวมงานของหัวหน้าห้อง) ต้องให้ผู้บริหารตรวจรับ/ตีกลับ
    if p_status in ('accepted', 'returned') and v_t.assignee_id = v_my_emp and not public.is_admin() then raise exception 'งานของตัวเองต้องให้ผู้บริหารตรวจรับ'; end if;
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

