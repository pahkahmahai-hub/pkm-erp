-- 0062: งานฝั่ง GC — ประเภทงาน (tag) + จำนวน (เช่น ทำสีใหม่ 5 SKU) เพื่อแยกงานและสรุปยอดได้
alter table public.work_tasks add column if not exists work_type text;
alter table public.work_tasks add column if not exists work_qty int check (work_qty is null or work_qty >= 0);
create index if not exists work_tasks_work_type_idx on public.work_tasks (work_type) where work_type is not null;

-- ให้ Claude (MCP) เห็นประเภทงาน + จำนวนด้วย
create or replace function public.claude_tasks(p_token text, p_room text, p_status text, p_person text, p_overdue boolean, p_from date, p_to date, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('task_no', t.task_no, 'title', t.title, 'room', r.name, 'status', t.status, 'priority', t.priority,
      'assignee', coalesce(e.nickname, e.first_name), 'ordered_by', coalesce(cu.display_name, cu.email),
      'start', t.start_date, 'due', t.due_date, 'due_time', to_char(t.due_time, 'HH24:MI'),
      'overdue', t.due_date < v_today and t.status::text not in ('accepted', 'cancelled', 'done'),
      'routine', t.routine_id is not null, 'topic', tp.name, 'work_type', t.work_type, 'work_qty', t.work_qty,
      'checklist_done', (select count(*) filter (where c.is_done) || '/' || count(*) from public.work_checklist c where c.task_id = t.id)) as x
    from public.work_tasks t join public.work_rooms r on r.id = t.room_id
      left join public.employees e on e.id = t.assignee_id left join public.app_users cu on cu.id = t.created_by left join public.work_topics tp on tp.id = t.topic_id
    where (p_room is null or r.key = p_room or lower(r.name) = lower(p_room))
      and (case when p_status is null or p_status = 'open' then t.status::text not in ('accepted', 'cancelled') when p_status = 'all' then true else t.status::text = p_status end)
      and (p_person is null or e.first_name ilike '%' || p_person || '%' or e.nickname ilike '%' || p_person || '%')
      and (not coalesce(p_overdue, false) or (t.due_date < v_today and t.status::text not in ('accepted', 'cancelled', 'done')))
      and (p_from is null or coalesce(t.start_date, t.due_date) >= p_from) and (p_to is null or coalesce(t.start_date, t.due_date) <= p_to)
    order by t.due_date nulls last, t.task_no limit least(coalesce(p_limit, 200), 500)) s), '[]'::jsonb);
end $$;
