-- 0016b: ส่วนเพิ่มของ 0016 สำหรับคนที่รัน 0016 ฉบับแรกไปแล้ว (เพิ่มคอลัมน์ task_id + ฟังก์ชันสร้าง job)
alter table public.store_deliveries add column if not exists task_id uuid references public.work_tasks(id) on delete set null;

-- สร้างงานสั่ง (job) ใน SW ROOM ให้ผู้รับผิดชอบของรายการส่ง แล้วผูกกลับ
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
  update public.store_deliveries set task_id = v_t.id, updated_at = now() where id = p_id;
  return v_t;
end $$;
