-- 0072: จำนวนคอมเมนต์ที่ฉันยังไม่ได้อ่าน ต่องาน → วงกลมแดงบนการ์ดในบอร์ด
-- นับคอมเมนต์ (ไม่นับบรรทัดสถานะของระบบ · ไม่นับของตัวเอง) ที่ใหม่กว่าครั้งล่าสุดที่ฉันเปิดงาน (work_task_reads, 0055)
-- งานที่ไม่เคยเปิดเลย: นับเฉพาะ 3 วันล่าสุด (กันงานเก่าขึ้นเลขเยอะ)
create index if not exists work_comments_task_created on public.work_comments (task_id, created_at desc);

create or replace function public.task_unread_counts(p_ids uuid[])
returns table (task_id uuid, unread int)
language sql stable security definer set search_path = public as $$
  with me as (select public.current_app_user_id() as uid)
  select c.task_id, count(*)::int
    from public.work_comments c
    cross join me
    left join public.work_task_reads r on r.task_id = c.task_id and r.user_id = me.uid
   where c.task_id = any(p_ids)
     and coalesce(c.kind, 'comment') = 'comment'
     and c.author_id is distinct from me.uid
     and c.created_at > coalesce(r.last_read_at, now() - interval '3 days')
     and public.can_see_task(c.task_id)
   group by c.task_id;
$$;
grant execute on function public.task_unread_counts(uuid[]) to authenticated;
