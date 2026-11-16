-- 0057: ทุกข้อความในแชทห้อง / คอมเมนต์ในงาน → เด้ง (Web Push) หาทุกคนที่เกี่ยวข้อง ยกเว้นคนส่ง
-- ส่งเป็น push อย่างเดียว ไม่สร้างรายการในหน้าแจ้งเตือน (หน้าแจ้งเตือนจะได้ไม่ท่วม)
-- push ห้องเดียวกัน/งานเดียวกันใช้ tag เดียวกัน → บนมือถือแทนที่อันเก่าและเด้งใหม่ ไม่กองเป็นสิบอัน

create or replace function public.push_to_users(p_users uuid[], p_title text, p_body text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path = public as $$
declare v_subs jsonb; v_endpoint text := public.secret_of('push_endpoint'); v_secret text := public.secret_of('push_dispatch_secret');
begin
  if v_endpoint is null or v_secret is null or coalesce(array_length(p_users, 1), 0) = 0 then return; end if;
  -- ทีละ 20 เครื่อง (API ส่งได้สูงสุด 20 ต่อครั้ง)
  for v_subs in
    select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
      from (select s.*, (row_number() over () - 1) / 20 as grp from public.push_subscriptions s where s.user_id = any(p_users)) x
     group by grp
  loop
    perform net.http_post(
      url := v_endpoint,
      body := jsonb_build_object('secret', v_secret, 'subscriptions', v_subs, 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000);
  end loop;
exception when others then
  return;   -- push ล้มเหลว ห้ามทำให้การส่งข้อความล้ม
end $$;

-- แชทห้อง: สมาชิกห้อง + หัวหน้าห้องแม่ + ผู้บริหาร (ไม่รวมคนส่ง และคนที่ถูก @ ซึ่งได้แจ้งเตือนอยู่แล้ว)
create or replace function public.push_on_room_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_room public.work_rooms; v_users uuid[]; v_author text; v_mentioned uuid[];
begin
  select * into v_room from public.work_rooms where id = new.room_id;
  select array_agg(coalesce(public.user_id_of_employee(x), x)) into v_mentioned from unnest(coalesce(new.mentions, '{}')) x;
  select array_agg(distinct u.id) into v_users
    from public.app_users u
   where u.is_active and u.id is distinct from new.author_id and not (u.id = any(coalesce(v_mentioned, '{}')))
     and (u.role = 'admin'
          or u.employee_id in (select m.employee_id from public.work_room_members m where m.room_id = new.room_id)
          or u.employee_id in (select m.employee_id from public.work_room_members m join public.work_rooms p on p.id = m.room_id
                                where p.key = v_room.parent_key and m.is_lead));
  select coalesce((select coalesce(nullif(e.nickname, ''), e.first_name) from public.employees e where e.id = a.employee_id), a.display_name, split_part(a.email, '@', 1))
    into v_author from public.app_users a where a.id = new.author_id;
  perform public.push_to_users(v_users, format('💬 %s · %s', coalesce(v_author, ''), v_room.name),
    left(coalesce(nullif(new.body, ''), case when new.image_url is not null then '📷 รูปภาพ' else '📎 ไฟล์' end), 160),
    '/work/rooms/' || v_room.key || '?tab=chat', new.room_id::text);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists work_room_messages_push on public.work_room_messages;
create trigger work_room_messages_push after insert on public.work_room_messages for each row execute function public.push_on_room_message();

-- คอมเมนต์ในงาน: คนในห้อง + ผู้รับงาน/ผู้ร่วมงาน + ผู้รับผิดชอบรายข้อ + ผู้บริหาร (ไม่รวมคนส่ง · ข้ามข้อความสถานะของระบบ)
create or replace function public.push_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.work_tasks; v_users uuid[]; v_author text;
begin
  if coalesce(new.kind, 'comment') <> 'comment' then return new; end if;
  select * into t from public.work_tasks where id = new.task_id;
  select array_agg(distinct u.id) into v_users
    from public.app_users u
   where u.is_active and u.id is distinct from new.author_id
     and (u.role = 'admin'
          or u.employee_id in (select m.employee_id from public.work_room_members m where m.room_id = t.room_id)
          or u.employee_id = t.assignee_id
          or u.employee_id = any(coalesce(t.co_assignee_ids, '{}'))
          or u.employee_id in (select c.assignee_id from public.work_checklist c where c.task_id = t.id));
  select coalesce((select coalesce(nullif(e.nickname, ''), e.first_name) from public.employees e where e.id = a.employee_id), a.display_name, split_part(a.email, '@', 1))
    into v_author from public.app_users a where a.id = new.author_id;
  perform public.push_to_users(v_users, format('💬 %s · #%s %s', coalesce(v_author, ''), t.task_no, left(t.title, 40)),
    left(coalesce(nullif(new.body, ''), case when new.image_url is not null then '📷 รูปภาพ' else '📎 ไฟล์' end), 160),
    '/work/tasks/' || t.id, t.id::text);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists work_comments_push on public.work_comments;
create trigger work_comments_push after insert on public.work_comments for each row execute function public.push_on_comment();
