-- 0058: มอบหมายข้อในเช็คลิสต์ให้ผู้บริหาร (ไม่มีประวัติพนักงาน) ได้ → เก็บเป็น app_user id
alter table public.work_checklist add column if not exists assignee_user_id uuid references public.app_users(id) on delete set null;

create or replace function public.checklist_assign_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_task public.work_tasks;
begin
  if new.assignee_id is null and new.assignee_user_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id and new.assignee_user_id is not distinct from old.assignee_user_id then return new; end if;
  v_user := coalesce(new.assignee_user_id, public.user_id_of_employee(new.assignee_id));
  select * into v_task from public.work_tasks where id = new.task_id;
  if v_user is not null and v_user is distinct from public.current_app_user_id() then
    insert into public.work_notifications (user_id, task_id, message)
    values (v_user, new.task_id, format('มอบหมายขั้นตอน "%s" ในงาน #%s %s%s', new.label, v_task.task_no, v_task.title,
            case when new.due_date is not null then ' · ครบ ' || to_char(new.due_date, 'DD/MM/') || (extract(year from new.due_date)::int + 543) else '' end));
  end if;
  return new;
end $$;
drop trigger if exists trg_checklist_assign_notify on public.work_checklist;
create trigger trg_checklist_assign_notify after insert or update of assignee_id, assignee_user_id on public.work_checklist
  for each row execute function public.checklist_assign_notify();
