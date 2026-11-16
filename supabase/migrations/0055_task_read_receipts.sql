-- 0055: "อ่านแล้ว" ในคอมเมนต์ของงาน (แบบเดียวกับแชทห้อง 0050)
create table if not exists public.work_task_reads (
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
alter table public.work_task_reads enable row level security;
drop policy if exists "task reads own" on public.work_task_reads;
create policy "task reads own" on public.work_task_reads for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id() and public.can_see_task(task_id));

create or replace function public.mark_task_read(p_task uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.work_task_reads (task_id, user_id, last_read_at)
  select p_task, public.current_app_user_id(), now()
   where public.current_app_user_id() is not null and public.can_see_task(p_task)
  on conflict (task_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;
grant execute on function public.mark_task_read(uuid) to authenticated;

create or replace function public.task_read_status(p_task uuid)
returns table (user_id uuid, name text, last_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select rd.user_id,
         coalesce(nullif(e.nickname, ''), e.first_name, u.display_name, split_part(u.email, '@', 1)),
         rd.last_read_at
    from public.work_task_reads rd
    join public.app_users u on u.id = rd.user_id
    left join public.employees e on e.id = u.employee_id
   where rd.task_id = p_task and public.can_see_task(p_task)
   order by rd.last_read_at desc;
$$;
grant execute on function public.task_read_status(uuid) to authenticated;
