-- 0068: ↩ ยกเลิกการกดล่าสุด (กดผิด) — ย้อนสถานะงานกลับ 1 ขั้น
--   ทำเสร็จแล้ว (รอตรวจรับ) → กำลังทำ      : ผู้รับงาน / คนที่กดทำเสร็จ / ผู้สั่ง / หัวหน้าห้อง / ผู้บริหาร
--   ตรวจรับแล้ว / ตีกลับ   → รอตรวจรับ     : ผู้สั่ง / หัวหน้าห้อง / ผู้บริหาร  (SW ที่ตรวจรับแล้วใช้ปุ่มย้อนขั้นส่งห้างเดิม)
--   ยกเลิกงาน             → กำลังทำ / ใหม่ : ผู้สั่ง / หัวหน้าห้อง / ผู้บริหาร
create or replace function public.undo_task_status(p_task uuid) returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_me uuid := public.current_app_user_id(); v_emp uuid := public.my_employee_id();
        v_mgr boolean; v_prev text; v_label text;
begin
  select * into v_t from public.work_tasks where id = p_task for update;
  if v_t.id is null then raise exception 'ไม่พบงาน'; end if;
  v_mgr := public.is_admin() or v_t.created_by = v_me or public.is_room_lead(v_t.room_id);

  if v_t.status = 'done' then
    if not (v_mgr or v_t.done_by = v_me or v_t.assignee_id = v_emp or v_emp = any(coalesce(v_t.co_assignee_ids, '{}'))) then raise exception 'ไม่มีสิทธิ์ย้อนสถานะงานนี้'; end if;
    update public.work_tasks set status = 'in_progress', started_at = coalesce(started_at, now()), done_at = null, done_by = null, done_note = null
     where id = p_task returning * into v_t;
    v_label := 'ยกเลิก "ทำเสร็จแล้ว" → กลับเป็นกำลังทำ';
  elsif v_t.status in ('accepted', 'returned') then
    if not v_mgr then raise exception 'เฉพาะผู้สั่งงาน หัวหน้าห้อง หรือผู้บริหาร'; end if;
    if v_t.status = 'accepted' and (select key from public.work_rooms where id = v_t.room_id) = 'sw-room' then raise exception 'งาน SW ใช้ปุ่มย้อนขั้นส่งห้าง'; end if;
    v_label := case v_t.status when 'accepted' then 'ยกเลิก "ตรวจรับ"' else 'ยกเลิก "ตีกลับ"' end || ' → กลับเป็นรอตรวจรับ';
    update public.work_tasks set status = 'done', reviewed_at = null, reviewed_by = null, review_note = null
     where id = p_task returning * into v_t;
  elsif v_t.status = 'cancelled' then
    if not v_mgr then raise exception 'เฉพาะผู้สั่งงาน หัวหน้าห้อง หรือผู้บริหาร'; end if;
    v_prev := case when v_t.started_at is not null then 'in_progress' else 'open' end;
    update public.work_tasks set status = v_prev::public.task_status, reviewed_at = null, reviewed_by = null, review_note = null
     where id = p_task returning * into v_t;
    v_label := 'ยกเลิก "ยกเลิกงาน" → กลับเป็น' || case v_prev when 'open' then 'งานใหม่' else 'กำลังทำ' end;
  else
    raise exception 'สถานะนี้ย้อนไม่ได้ (ตอนนี้: %)', v_t.status;
  end if;

  perform public.task_log(p_task, '↩ ' || v_label);
  return v_t;
end $$;
grant execute on function public.undo_task_status(uuid) to authenticated;
