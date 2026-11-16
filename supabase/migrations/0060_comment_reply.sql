-- 0060: ตอบกลับ (อ้างอิงข้อความ) ในคอมเมนต์ของงาน — เหมือนแชทห้อง
alter table public.work_comments add column if not exists reply_to uuid references public.work_comments(id) on delete set null;

create or replace function public.set_comment_reply(p_comment uuid, p_reply uuid) returns void
language sql security definer set search_path = public as $$
  update public.work_comments c set reply_to = p_reply
   where c.id = p_comment and c.author_id = public.current_app_user_id()
     and exists (select 1 from public.work_comments q where q.id = p_reply and q.task_id = c.task_id);
$$;
grant execute on function public.set_comment_reply(uuid, uuid) to authenticated;
