-- =====================================================================
-- PKM ERP — 0030: ปุ่มย้อนขั้นส่งห้าง (SW ROOM)
--   อัพเข้าระบบเรียบร้อย → สินค้าถึงแล้ว → ส่งสินค้าแล้ว → เตรียมส่ง → รอตรวจรับ
--   กดได้โดยหัวหน้าห้อง SW ★ และผู้บริหาร · ซิงก์ขั้นในตารางส่งห้างลงตาม · บันทึกในประวัติงาน
-- =====================================================================
create or replace function public.sw_step_back(p_task uuid, p_note text default null) returns public.work_tasks
language plpgsql security definer set search_path = public as $$
declare v_t public.work_tasks; v_prev text; v_step int; v_me uuid := public.current_app_user_id();
begin
  select * into v_t from public.work_tasks where id = p_task;
  if v_t.id is null then raise exception 'ไม่พบงาน'; end if;
  if (select key from public.work_rooms where id = v_t.room_id) <> 'sw-room' then raise exception 'ใช้เฉพาะ SW ROOM'; end if;
  if not (public.is_admin() or public.is_room_lead(v_t.room_id)) then raise exception 'เฉพาะหัวหน้าห้องหรือผู้บริหาร'; end if;
  v_prev := case v_t.status::text when 'accepted' then 'arrived' when 'arrived' then 'shipped' when 'shipped' then 'prep' when 'prep' then 'done' end;
  if v_prev is null then raise exception 'ย้อนจากขั้นนี้ไม่ได้ (ตอนนี้: %)', v_t.status; end if;
  v_step := case v_prev when 'done' then 3 when 'prep' then 4 when 'shipped' then 5 else 6 end;

  update public.work_tasks set status = v_prev::public.task_status,
    arrived_at = case when v_prev in ('shipped', 'prep', 'done') then null else arrived_at end
  where id = p_task returning * into v_t;
  perform public.task_log(p_task, '↩ ย้อนขั้นกลับเป็น "' || case v_prev when 'arrived' then 'สินค้าถึงแล้ว' when 'shipped' then 'ส่งสินค้าแล้ว' when 'prep' then 'เตรียมส่ง' else 'รอตรวจรับ' end || '"' || coalesce(' — ' || p_note, ''));
  update public.store_deliveries set step = least(step, v_step), updated_at = now(),
    step_log = step_log || jsonb_build_object('step', v_step, 'at', now(), 'by', v_me, 'back', true)
  where task_id = p_task and step > v_step;
  return v_t;
end $$;
grant execute on function public.sw_step_back(uuid, text) to authenticated;

-- ย้อนจาก "อัพเข้าระบบเรียบร้อย" กลับมา "สินค้าถึงแล้ว" ไม่ต้องเริ่มนับ 7 วันใหม่
create or replace function public.sw_task_deadlines() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select key from public.work_rooms where id = new.room_id) = 'sw-room' then
    if new.arrive_due is null and new.due_date is not null then new.arrive_due := new.due_date + 2; end if;
    if new.status = 'arrived' and (tg_op = 'INSERT' or (old.status::text not in ('arrived', 'accepted')) or new.arrived_at is null) then
      new.arrived_at := coalesce(case when tg_op = 'UPDATE' and old.status::text = 'accepted' then old.arrived_at end, now());
    end if;
  end if;
  return new;
end $$;
