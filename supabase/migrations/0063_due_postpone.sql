-- 0063: ขอเลื่อนกำหนดส่ง (postpone) พร้อมเหตุผล → หัวหน้าห้อง / ผู้บริหาร อนุมัติ
-- อนุมัติแล้ว กำหนดส่งใหม่ใช้คำนวณ "ส่งตรงเวลา" · เก็บประวัติทุกครั้ง (ใครขอ ขอเมื่อไหร่ ก่อน/หลังเลยกำหนด ใครอนุมัติ)
alter table public.work_tasks add column if not exists pending_due date;
alter table public.work_tasks add column if not exists pending_due_reason text;
alter table public.work_tasks add column if not exists pending_due_by uuid references public.app_users(id) on delete set null;
alter table public.work_tasks add column if not exists postpone_count int not null default 0;

create table if not exists public.work_due_changes (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.work_tasks(id) on delete cascade,
  old_due      date,
  new_due      date not null,
  reason       text,
  requested_by uuid references public.app_users(id) on delete set null,
  requested_at timestamptz not null default now(),
  late_request boolean not null default false,          -- ขอหลังเลยกำหนดไปแล้ว
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by   uuid references public.app_users(id) on delete set null,
  decided_at   timestamptz,
  decide_note  text
);
create index if not exists work_due_changes_task_idx on public.work_due_changes (task_id, requested_at desc);
alter table public.work_due_changes enable row level security;
drop policy if exists "due changes read" on public.work_due_changes;
create policy "due changes read" on public.work_due_changes for select to authenticated using (public.can_see_task(task_id));

create or replace function public.my_display_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.emp_name(employee_id), display_name, split_part(email, '@', 1)) from public.app_users where id = public.current_app_user_id();
$$;

create or replace function public.request_postpone(p_task uuid, p_new_due date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_me text := public.my_display_name(); v_today date := (now() at time zone 'Asia/Bangkok')::date; v_lead record;
begin
  select * into t from public.work_tasks where id = p_task;
  if t.id is null then raise exception 'ไม่พบงาน'; end if;
  if t.status in ('accepted', 'cancelled') then raise exception 'งานปิดแล้ว'; end if;
  if not (t.assignee_id = public.my_employee_id() or public.my_employee_id() = any(coalesce(t.co_assignee_ids, '{}'))) then raise exception 'เฉพาะผู้รับงานที่ขอเลื่อนได้'; end if;
  if p_new_due is null then raise exception 'เลือกวันกำหนดส่งใหม่'; end if;
  if t.due_date is not null and p_new_due <= t.due_date then raise exception 'วันใหม่ต้องหลังกำหนดเดิม'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'กรุณาใส่เหตุผล'; end if;
  if t.pending_due is not null then raise exception 'มีคำขอเลื่อนรออนุมัติอยู่แล้ว'; end if;

  update public.work_tasks set pending_due = p_new_due, pending_due_reason = trim(p_reason), pending_due_by = public.current_app_user_id() where id = p_task;
  insert into public.work_due_changes (task_id, old_due, new_due, reason, requested_by, late_request)
  values (p_task, t.due_date, p_new_due, trim(p_reason), public.current_app_user_id(), t.due_date is not null and t.due_date < v_today);
  perform public.task_log(p_task, format('%s ขอเลื่อนกำหนดส่ง %s → %s · เหตุผล: %s · รอหัวหน้าอนุมัติ', v_me,
    coalesce(to_char(t.due_date, 'DD/MM/') || (extract(year from t.due_date)::int + 543), '—'), to_char(p_new_due, 'DD/MM/') || (extract(year from p_new_due)::int + 543), trim(p_reason)));
  for v_lead in
    select distinct u.id from public.app_users u
     where u.is_active and (u.role = 'admin' or u.employee_id in (
       select m.employee_id from public.work_room_members m where m.is_lead and (m.room_id = t.room_id or m.room_id in (
         select p.id from public.work_rooms p join public.work_rooms r on r.parent_key = p.key where r.id = t.room_id))))
  loop
    perform public.notify_user(v_lead.id, p_task, format('%s ขอเลื่อนกำหนดส่งงาน #%s %s เป็น %s', v_me, t.task_no, t.title, to_char(p_new_due, 'DD/MM')));
  end loop;
end $$;

create or replace function public.decide_postpone(p_task uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_me text := public.my_display_name();
begin
  select * into t from public.work_tasks where id = p_task;
  if t.pending_due is null then raise exception 'ไม่มีคำขอเลื่อน'; end if;
  if not (public.is_admin() or public.is_room_lead(t.room_id)) then raise exception 'เฉพาะหัวหน้าห้องหรือผู้บริหาร'; end if;
  if t.pending_due_by = public.current_app_user_id() and not public.is_admin() then raise exception 'คำขอของตัวเองต้องให้ผู้บริหารอนุมัติ'; end if;
  update public.work_due_changes set status = case when p_approve then 'approved' else 'rejected' end, decided_by = public.current_app_user_id(), decided_at = now(), decide_note = nullif(trim(p_note), '')
   where task_id = p_task and status = 'pending';
  if p_approve then
    update public.work_tasks set due_date = t.pending_due, postpone_count = postpone_count + 1, pending_due = null, pending_due_reason = null, pending_due_by = null where id = p_task;
    perform public.task_log(p_task, format('%s อนุมัติเลื่อนกำหนดส่งเป็น %s%s', v_me, to_char(t.pending_due, 'DD/MM/') || (extract(year from t.pending_due)::int + 543), coalesce(' · ' || nullif(trim(p_note), ''), '')));
    perform public.notify_user(t.pending_due_by, p_task, format('อนุมัติเลื่อนกำหนดส่งงาน #%s %s เป็น %s แล้ว', t.task_no, t.title, to_char(t.pending_due, 'DD/MM')));
  else
    update public.work_tasks set pending_due = null, pending_due_reason = null, pending_due_by = null where id = p_task;
    perform public.task_log(p_task, format('%s ไม่อนุมัติเลื่อนกำหนดส่ง%s', v_me, coalesce(' · ' || nullif(trim(p_note), ''), '')));
    perform public.notify_user(t.pending_due_by, p_task, format('ไม่อนุมัติเลื่อนกำหนดส่งงาน #%s %s%s', t.task_no, t.title, coalesce(' — ' || nullif(trim(p_note), ''), '')));
  end if;
end $$;

grant execute on function public.request_postpone(uuid, date, text) to authenticated;
grant execute on function public.decide_postpone(uuid, boolean, text) to authenticated;
