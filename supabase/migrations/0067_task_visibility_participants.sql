-- 0067: คนที่เคยเกี่ยวข้องกับงาน ยังเปิดดูงานนั้นได้ แม้ไม่ได้อยู่ในห้อง และไม่ได้เป็นผู้รับงานแล้ว
--   · ผู้สั่งงาน (created_by) — เช่น SW สั่งงานเข้าห้อง GC
--   · คนที่เคยคอมเมนต์ / เคยกดเปลี่ยนสถานะ / เคยส่งต่องานให้คนอื่น (มีชื่อในประวัติงาน)
--   · คนที่ขอส่งต่องานแล้วรออนุมัติ
-- เดิม (0053): สมาชิกห้อง · ผู้รับงาน · ผู้ร่วมงาน · ผู้รับผิดชอบข้อในเช็คลิสต์ เท่านั้น
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
            or exists (select 1 from public.work_comments m where m.task_id = t.id and m.author_id = public.current_app_user_id())));
$$;
grant execute on function public.can_see_task(uuid) to authenticated;

create index if not exists work_comments_task_author_idx on public.work_comments (task_id, author_id);
