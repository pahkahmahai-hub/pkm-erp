-- 0052: เช็คลิสต์รายข้อมีวันกำหนด + ผู้รับผิดชอบ (ไม่บังคับ)
-- งานแสดง "ขั้นถัดไป" = ข้อที่ยังไม่ติ๊กและมีวันกำหนดเร็วที่สุด (เก็บไว้ที่ work_tasks ให้บอร์ดอ่านได้เร็ว)
alter table public.work_checklist add column if not exists due_date date;
alter table public.work_checklist add column if not exists assignee_id uuid references public.employees(id) on delete set null;
alter table public.work_tasks add column if not exists next_step_label text;
alter table public.work_tasks add column if not exists next_step_due date;

create or replace function public.task_refresh_next_step(p_task uuid) returns void
language sql security definer set search_path = public as $$
  update public.work_tasks t
     set next_step_label = s.label, next_step_due = s.due_date
    from (select (select c.label from public.work_checklist c where c.task_id = p_task and not c.is_done and c.due_date is not null order by c.due_date, c.sort_order limit 1) as label,
                 (select min(c.due_date) from public.work_checklist c where c.task_id = p_task and not c.is_done) as due_date) s
   where t.id = p_task
     and (t.next_step_label is distinct from s.label or t.next_step_due is distinct from s.due_date);
$$;

create or replace function public.checklist_next_step_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.task_refresh_next_step(coalesce(new.task_id, old.task_id));
  return null;
end $$;
drop trigger if exists trg_checklist_next_step on public.work_checklist;
create trigger trg_checklist_next_step after insert or update or delete on public.work_checklist
  for each row execute function public.checklist_next_step_trg();

-- แจ้งเตือนคนที่ถูกมอบหมายข้อในเช็คลิสต์
create or replace function public.checklist_assign_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_task public.work_tasks;
begin
  if new.assignee_id is null or (tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id) then return new; end if;
  v_user := public.user_id_of_employee(new.assignee_id);
  select * into v_task from public.work_tasks where id = new.task_id;
  if v_user is not null and v_user is distinct from (select id from public.app_users where auth_user_id = auth.uid()) then
    insert into public.work_notifications (user_id, task_id, message)
    values (v_user, new.task_id, format('มอบหมายขั้นตอน "%s" ในงาน #%s %s%s', new.label, v_task.task_no, v_task.title,
            case when new.due_date is not null then ' · ครบ ' || to_char(new.due_date, 'DD/MM/') || (extract(year from new.due_date)::int + 543) else '' end));
  end if;
  return new;
end $$;
drop trigger if exists trg_checklist_assign_notify on public.work_checklist;
create trigger trg_checklist_assign_notify after insert or update of assignee_id on public.work_checklist
  for each row execute function public.checklist_assign_notify();
