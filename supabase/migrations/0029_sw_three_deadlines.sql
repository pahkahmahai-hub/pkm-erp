-- =====================================================================
-- PKM ERP — 0029: งานส่งห้าง SW ROOM มีกำหนด 3 ระยะ
--   ① กำหนดจัดเสร็จ   = work_tasks.due_date (เดิม)
--   ② กำหนดถึงห้าง    = work_tasks.arrive_due (กรอกเอง · ว่าง = จัดเสร็จ + 2 วัน)
--   ③ กำหนดอัพเข้าระบบ = วันที่กด "สินค้าถึงแล้ว" จริง + 7 วัน (ก่อนของถึง แสดงเป็นคาดการณ์ = ② + 7)
-- =====================================================================
alter table public.work_tasks add column if not exists arrive_due date;
alter table public.work_tasks add column if not exists arrived_at timestamptz;
alter table public.store_deliveries add column if not exists arrive_due date;

create or replace function public.sw_task_deadlines() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select key from public.work_rooms where id = new.room_id) = 'sw-room' then
    if new.arrive_due is null and new.due_date is not null then new.arrive_due := new.due_date + 2; end if;
    if new.status = 'arrived' and (tg_op = 'INSERT' or old.status is distinct from 'arrived') then new.arrived_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists sw_task_deadlines on public.work_tasks;
create trigger sw_task_deadlines before insert or update on public.work_tasks for each row execute function public.sw_task_deadlines();

-- ตั้งกำหนดถึงห้างในตารางส่งห้าง + ซิงก์ไปงานที่ผูกไว้
create or replace function public.set_delivery_arrive_due(p_id uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare v_task uuid;
begin
  if not public.can_deliver() then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.store_deliveries set arrive_due = p_date, updated_at = now() where id = p_id returning task_id into v_task;
  if v_task is not null and p_date is not null then update public.work_tasks set arrive_due = p_date where id = v_task; end if;
end $$;
grant execute on function public.set_delivery_arrive_due(uuid, date) to authenticated;

-- สร้าง job จากตารางส่งห้าง → ใส่กำหนดถึงห้างให้งานด้วย
create or replace function public.create_delivery_task(p_id uuid, p_title text, p_description text, p_checklist text[])
returns public.work_tasks language plpgsql security definer set search_path = public as $$
declare d public.store_deliveries; v_room uuid; v_t public.work_tasks;
begin
  if not public.can_deliver() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into d from public.store_deliveries where id = p_id;
  if d.id is null then raise exception 'ไม่พบรายการ'; end if;
  if d.task_id is not null then select * into v_t from public.work_tasks where id = d.task_id; if v_t.id is not null then return v_t; end if; end if;
  select id into v_room from public.work_rooms where key = 'sw-room';
  v_t := public.create_task(v_room, p_title, p_description, d.assignee_id, coalesce(d.target_date, d.week_start + 4), 'normal', p_checklist);
  if d.arrive_due is not null then update public.work_tasks set arrive_due = d.arrive_due where id = v_t.id returning * into v_t; end if;
  update public.store_deliveries set task_id = v_t.id, updated_at = now() where id = p_id;
  return v_t;
end $$;

-- ข้อมูลเดิม: งาน SW ที่ยังไม่มีกำหนดถึงห้าง = จัดเสร็จ + 2 · งานที่ "สินค้าถึงแล้ว" อยู่ = ใช้วันที่ในตารางส่งห้าง (ขั้น 6) ถ้ามี ไม่งั้นใช้วันนี้
update public.work_tasks t set arrive_due = t.due_date + 2
  from public.work_rooms r where r.id = t.room_id and r.key = 'sw-room' and t.arrive_due is null and t.due_date is not null;
update public.work_tasks t set arrived_at = coalesce(
    (select max((e->>'at')::timestamptz) from public.store_deliveries sd, jsonb_array_elements(sd.step_log) e where sd.task_id = t.id and (e->>'step')::int = 6),
    now())
  where t.status = 'arrived' and t.arrived_at is null;
