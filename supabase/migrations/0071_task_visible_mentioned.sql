-- 0071: คนที่ถูก @ ในคอมเมนต์ของงาน เปิดงานนั้นได้ (แม้อยู่คนละห้อง) — ใช้กับบอร์ด "งานที่เกี่ยวกับฉัน"
-- ต่อจาก 0067: สมาชิกห้อง · ผู้สั่ง · ผู้รับ/ผู้ร่วม · เช็คลิสต์ · เคยคอมเมนต์ · รออนุมัติส่งต่อ  + ถูก @ (ใหม่)
create or replace function public.can_see_task(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.work_tasks t
     where t.id = p_task
       and (public.is_room_member(t.room_id)
            or t.created_by = public.current_app_user_id()
            or t.pending_forward_by = public.current_app_user_id()
            or (public.my_employee_id() is not null and (t.assignee_id = public.my_employee_id() or public.my_employee_id() = any(coalesce(t.co_assignee_ids, '{}'))))
            or exists (select 1 from public.work_checklist c where c.task_id = t.id and (c.assignee_id = public.my_employee_id() or c.assignee_user_id = public.current_app_user_id()))
            or exists (select 1 from public.work_comments m where m.task_id = t.id
                         and (m.author_id = public.current_app_user_id()
                              or m.mentions && array_remove(array[public.my_employee_id(), public.current_app_user_id()], null)))));
$$;
grant execute on function public.can_see_task(uuid) to authenticated;

create index if not exists work_comments_mentions_gin on public.work_comments using gin (mentions);

-- งานทั้งหมดที่ฉันเกี่ยวข้อง (ทุกห้อง) + เกี่ยวแบบไหน
create or replace function public.my_related_tasks(p_history boolean default false)
returns table (task_id uuid, roles text[])
language sql stable security definer set search_path = public as $$
  with me as (select public.current_app_user_id() as uid, public.my_employee_id() as emp),
  rel as (
    select t.id, 'assignee' as role from public.work_tasks t, me where me.emp is not null and t.assignee_id = me.emp
    union all
    select t.id, 'co' from public.work_tasks t, me where me.emp is not null and me.emp = any(coalesce(t.co_assignee_ids, '{}'))
    union all
    select c.task_id, 'checklist' from public.work_checklist c, me where (me.emp is not null and c.assignee_id = me.emp) or c.assignee_user_id = me.uid
    union all
    select m.task_id, 'mention' from public.work_comments m, me where m.mentions && array_remove(array[me.emp, me.uid], null) and m.author_id is distinct from me.uid
  )
  select r.id, array_agg(distinct r.role)
    from rel r join public.work_tasks t on t.id = r.id
   where case when p_history then t.status in ('accepted', 'cancelled') and coalesce(t.reviewed_at, t.created_at) > now() - interval '30 days'
              else t.status not in ('accepted', 'cancelled') end
   group by r.id
   limit 400;
$$;
grant execute on function public.my_related_tasks(boolean) to authenticated;
