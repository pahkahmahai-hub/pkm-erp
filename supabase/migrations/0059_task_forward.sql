-- 0059: ส่งต่องาน (โอนผู้รับ) — งานเดิมใบเดียว เปลี่ยนผู้รับ + บันทึกในคอมเมนต์ + แจ้งเตือน
--   ผู้สั่งงาน / หัวหน้าห้อง / ผู้บริหาร → ส่งต่อได้ทันที
--   ผู้รับงานคนแรก → ส่งต่อได้ทันที 1 ครั้ง
--   คนที่ได้รับงานจากการส่งต่อ → ถ้าจะส่งต่ออีก ต้องให้หัวหน้าห้อง (หรือผู้บริหาร) อนุมัติ
alter table public.work_tasks add column if not exists forward_count int not null default 0;
alter table public.work_tasks add column if not exists pending_forward_to uuid references public.employees(id) on delete set null;
alter table public.work_tasks add column if not exists pending_forward_by uuid references public.app_users(id) on delete set null;
alter table public.work_tasks add column if not exists pending_forward_note text;
alter table public.work_tasks add column if not exists pending_forward_keep boolean not null default false;

create or replace function public.emp_name(p_emp uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nickname, ''), first_name) from public.employees where id = p_emp;
$$;

create or replace function public.task_is_manager(t public.work_tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or t.created_by = public.current_app_user_id() or public.is_room_lead(t.room_id);
$$;

-- ทำการโอนจริง (ใช้ภายใน)
create or replace function public.apply_task_forward(p_task uuid, p_to uuid, p_note text, p_keep boolean, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_old uuid; v_co uuid[];
begin
  select * into t from public.work_tasks where id = p_task;
  v_old := t.assignee_id;
  v_co := array_remove(coalesce(t.co_assignee_ids, '{}'), p_to);
  if p_keep and v_old is not null and v_old <> p_to and not (v_old = any(v_co)) then v_co := v_co || v_old; end if;
  update public.work_tasks
     set assignee_id = p_to, co_assignee_ids = v_co, forward_count = forward_count + 1,
         pending_forward_to = null, pending_forward_by = null, pending_forward_note = null, pending_forward_keep = false
   where id = p_task;
  perform public.task_log(p_task, format('%s ส่งต่องานจาก %s ให้ %s%s', p_by, coalesce(public.emp_name(v_old), '—'), public.emp_name(p_to),
          case when coalesce(trim(p_note), '') <> '' then ' · ' || trim(p_note) else '' end));
  perform public.notify_user(public.user_id_of_employee(p_to), p_task, format('ได้รับงานที่ส่งต่อมา: #%s %s', t.task_no, t.title));
  perform public.notify_user(t.created_by, p_task, format('งาน #%s %s ถูกส่งต่อให้ %s', t.task_no, t.title, public.emp_name(p_to)));
end $$;

-- กดส่งต่อ: ทำทันที หรือส่งขออนุมัติ (คืน 'done' / 'pending')
create or replace function public.forward_task(p_task uuid, p_to uuid, p_note text default null, p_keep boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_me text; v_lead record;
begin
  select * into t from public.work_tasks where id = p_task;
  if t.id is null then raise exception 'ไม่พบงาน'; end if;
  if p_to is null then raise exception 'เลือกคนรับงานใหม่'; end if;
  if p_to = t.assignee_id then raise exception 'คนนี้เป็นผู้รับงานอยู่แล้ว'; end if;
  if t.status in ('accepted', 'cancelled') then raise exception 'งานปิดแล้ว ส่งต่อไม่ได้'; end if;
  select coalesce(public.emp_name(employee_id), display_name, split_part(email, '@', 1)) into v_me from public.app_users where id = public.current_app_user_id();

  if public.task_is_manager(t) or (t.assignee_id = public.my_employee_id() and t.forward_count = 0) then
    perform public.apply_task_forward(p_task, p_to, p_note, p_keep, v_me);
    return 'done';
  end if;
  if t.assignee_id is distinct from public.my_employee_id() then raise exception 'เฉพาะผู้รับงาน ผู้สั่งงาน หรือหัวหน้าห้องที่ส่งต่องานได้'; end if;

  -- ได้รับงานจากการส่งต่อมาแล้ว → ขออนุมัติหัวหน้า
  update public.work_tasks set pending_forward_to = p_to, pending_forward_by = public.current_app_user_id(), pending_forward_note = p_note, pending_forward_keep = coalesce(p_keep, false) where id = p_task;
  perform public.task_log(p_task, format('%s ขอส่งต่องานให้ %s · รอหัวหน้าอนุมัติ%s', v_me, public.emp_name(p_to), case when coalesce(trim(p_note), '') <> '' then ' · ' || trim(p_note) else '' end));
  for v_lead in
    select distinct u.id from public.app_users u
     where u.is_active and (u.role = 'admin' or u.employee_id in (
       select m.employee_id from public.work_room_members m where m.is_lead and (m.room_id = t.room_id or m.room_id in (
         select p.id from public.work_rooms p join public.work_rooms r on r.parent_key = p.key where r.id = t.room_id))))
  loop
    perform public.notify_user(v_lead.id, p_task, format('%s ขออนุมัติส่งต่องาน #%s %s ให้ %s', v_me, t.task_no, t.title, public.emp_name(p_to)));
  end loop;
  return 'pending';
end $$;

-- หัวหน้า/ผู้บริหาร อนุมัติหรือไม่อนุมัติคำขอส่งต่อ
create or replace function public.decide_task_forward(p_task uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_me text;
begin
  select * into t from public.work_tasks where id = p_task;
  if t.pending_forward_to is null then raise exception 'ไม่มีคำขอส่งต่อ'; end if;
  if not (public.is_admin() or public.is_room_lead(t.room_id)) then raise exception 'เฉพาะหัวหน้าห้องหรือผู้บริหาร'; end if;
  select coalesce(public.emp_name(employee_id), display_name, split_part(email, '@', 1)) into v_me from public.app_users where id = public.current_app_user_id();
  if p_approve then
    perform public.apply_task_forward(p_task, t.pending_forward_to, t.pending_forward_note, t.pending_forward_keep, v_me || ' (อนุมัติ)');
    perform public.notify_user(t.pending_forward_by, p_task, format('อนุมัติส่งต่องาน #%s %s แล้ว', t.task_no, t.title));
  else
    update public.work_tasks set pending_forward_to = null, pending_forward_by = null, pending_forward_note = null, pending_forward_keep = false where id = p_task;
    perform public.task_log(p_task, format('%s ไม่อนุมัติการส่งต่องานให้ %s', v_me, public.emp_name(t.pending_forward_to)));
    perform public.notify_user(t.pending_forward_by, p_task, format('ไม่อนุมัติส่งต่องาน #%s %s — ทำต่อหรือคุยกับหัวหน้า', t.task_no, t.title));
  end if;
end $$;

grant execute on function public.forward_task(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.decide_task_forward(uuid, boolean) to authenticated;
