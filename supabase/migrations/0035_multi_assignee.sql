-- =====================================================================
-- PKM ERP — 0035: งานเดียว หลายผู้รับงาน (ทุกห้อง)
--   assignee_id = ผู้รับผิดชอบหลัก · co_assignee_ids = ผู้ร่วมงาน (เห็นใน "งานของฉัน", ได้แจ้งเตือน, กดเริ่ม/ส่งงานได้)
--   ผู้รับงานทุกคนตรวจรับงานของตัวเองไม่ได้ (ต้องผู้สั่ง/หัวหน้า/ผู้บริหาร)
-- =====================================================================
alter table public.work_tasks add column if not exists co_assignee_ids uuid[] not null default '{}';
create index if not exists work_tasks_co_assignees on public.work_tasks using gin (co_assignee_ids);

-- แจ้งเตือนผู้รับงานหลัก + ผู้ร่วมงานทุกคน
create or replace function public.notify_task_people(p_t public.work_tasks, p_msg text) returns void
language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  perform public.notify_user(public.user_id_of_employee(p_t.assignee_id), p_t.id, p_msg);
  foreach e in array coalesce(p_t.co_assignee_ids, '{}') loop
    if e is distinct from p_t.assignee_id then perform public.notify_user(public.user_id_of_employee(e), p_t.id, p_msg); end if;
  end loop;
end $$;

-- เพิ่มผู้ร่วมงาน → แจ้งเตือนเฉพาะคนที่เพิ่งถูกเพิ่ม
create or replace function public.work_task_co_assign_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare e uuid; v_old uuid[] := case when tg_op = 'UPDATE' then coalesce(old.co_assignee_ids, '{}') else '{}' end;
begin
  foreach e in array coalesce(new.co_assignee_ids, '{}') loop
    if not (e = any(v_old)) and e is distinct from new.assignee_id then
      perform public.notify_user(public.user_id_of_employee(e), new.id, 'ได้รับมอบหมายงานร่วม: ' || new.title);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists work_task_co_assign_notify on public.work_tasks;
create trigger work_task_co_assign_notify after insert or update of co_assignee_ids on public.work_tasks for each row execute function public.work_task_co_assign_notify();

create or replace function public.set_task_status(p_task uuid, p_status public.task_status, p_note text default null)
returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_me uuid := public.current_app_user_id(); v_my_emp uuid := public.my_employee_id(); v_name text; v_sw boolean;
begin
  select * into v_t from public.work_tasks where id = p_task;
  if v_t.id is null then raise exception 'ไม่พบงาน'; end if;
  if not public.is_room_member(v_t.room_id) then raise exception 'ไม่มีสิทธิ์'; end if;
  select coalesce(display_name, email) into v_name from public.app_users where id = v_me;
  select (key = 'sw-room') into v_sw from public.work_rooms where id = v_t.room_id;

  if p_status in ('in_progress', 'done') then
    -- ผู้รับงาน (หรือ admin / ผู้สั่ง) ทำได้
    if not (public.is_admin() or v_t.assignee_id = v_my_emp or v_my_emp = any(v_t.co_assignee_ids) or v_t.created_by = v_me or public.is_room_lead(v_t.room_id)) then raise exception 'เฉพาะผู้รับงาน'; end if;
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
    if p_status in ('accepted', 'returned') and (v_t.assignee_id = v_my_emp or v_my_emp = any(v_t.co_assignee_ids)) and not public.is_admin() then raise exception 'งานของตัวเองต้องให้ผู้บริหารตรวจรับ'; end if;
    update public.work_tasks set status = p_status, reviewed_at = now(), reviewed_by = v_me, review_note = p_note
    where id = p_task returning * into v_t;
    perform public.task_log(p_task, case p_status when 'accepted' then (case when v_sw then 'เข้าระบบเรียบร้อย ✔ ปิดงาน' else 'ตรวจรับแล้ว ✔' end) when 'returned' then 'ตีกลับให้แก้' || coalesce(' — ' || p_note, '') else 'ยกเลิกงาน' end);
    perform public.notify_task_people(v_t, 
      case p_status when 'accepted' then (case when v_sw then 'เข้าระบบเรียบร้อย ปิดงาน: ' else 'ตรวจรับแล้ว: ' end) when 'returned' then 'ตีกลับ: ' else 'ยกเลิก: ' end || v_t.title);
    if p_status = 'accepted' then update public.store_deliveries set step = greatest(step, 7), updated_at = now() where task_id = p_task; end if;
  elsif p_status::text in ('prep', 'shipped', 'arrived') then
    -- ขั้นส่งห้าง (เฉพาะ SW ROOM): รอตรวจรับ → เตรียมส่ง → ส่งสินค้าแล้ว → สินค้าถึงแล้ว → เข้าระบบเรียบร้อย (accepted)
    if not v_sw then raise exception 'ขั้นตอนนี้ใช้เฉพาะ SW ROOM'; end if;
    if not (public.is_admin() or public.is_room_lead(v_t.room_id)) then raise exception 'เฉพาะหัวหน้าห้องหรือผู้บริหาร'; end if;
    if not ((p_status::text = 'prep' and v_t.status::text = 'done') or (p_status::text = 'shipped' and v_t.status::text = 'prep') or (p_status::text = 'arrived' and v_t.status::text = 'shipped')) then
      raise exception 'ลำดับขั้นไม่ถูกต้อง (ตอนนี้: %)', v_t.status; end if;
    update public.work_tasks set status = p_status, reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, v_me), review_note = coalesce(p_note, review_note) where id = p_task returning * into v_t;
    perform public.task_log(p_task, case p_status::text when 'prep' then 'อนุมัติ → เตรียมส่ง' when 'shipped' then 'ส่งสินค้าแล้ว' else 'สินค้าถึงห้างแล้ว' end || coalesce(' — ' || p_note, ''));
    perform public.notify_task_people(v_t, case p_status::text when 'prep' then 'อนุมัติแล้ว เตรียมส่ง: ' when 'shipped' then 'ส่งสินค้าแล้ว: ' else 'สินค้าถึงแล้ว: ' end || v_t.title);
    update public.store_deliveries set step = greatest(step, case p_status::text when 'prep' then 4 when 'shipped' then 5 else 6 end), updated_at = now() where task_id = p_task;   -- sync ตารางส่งห้าง
  elsif p_status = 'open' then
    update public.work_tasks set status = 'open' where id = p_task returning * into v_t;
  end if;
  return v_t;
end $$;
