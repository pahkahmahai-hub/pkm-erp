-- =====================================================================
-- PKM ERP — 0028: หัวหน้าห้องหลักมีสิทธิ์หัวหน้าในทุกห้องย่อยของทีม
--   SW ROOM ★ (จันทกาญจน์) → OFFICE / OPERATION / ONLINE
--   GC ROOM ★ (อารดา)      → GRAPHIC / VISUAL DESIGN / CONTENT
--   ตรวจรับ/ตีกลับ โอน แก้ไข ลบงานในห้องย่อยได้ · งานของตัวเองยังต้องให้ผู้บริหารตรวจรับ (กติกา 0019 เดิม)
-- =====================================================================
alter table public.work_rooms add column if not exists parent_key text references public.work_rooms(key) on update cascade;

update public.work_rooms set parent_key = 'sw-room' where key in ('office', 'operation', 'online');
update public.work_rooms set parent_key = 'gc-room' where key in ('graphic', 'visual', 'content');

-- หัวหน้าโดยตรง หรือหัวหน้าของห้องหลัก
create or replace function public.is_room_lead(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.work_room_members where room_id = p_room and employee_id = public.my_employee_id() and is_lead)
      or exists (select 1 from public.work_rooms c
                   join public.work_rooms p on p.key = c.parent_key
                   join public.work_room_members m on m.room_id = p.id
                  where c.id = p_room and m.employee_id = public.my_employee_id() and m.is_lead);
$$;

-- หัวหน้าห้องหลักเข้าห้องย่อยได้เสมอ (แม้ไม่ได้เป็นสมาชิก)
create or replace function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.work_room_members where room_id = p_room and employee_id = public.my_employee_id())
      or exists (select 1 from public.work_rooms c
                   join public.work_rooms p on p.key = c.parent_key
                   join public.work_room_members m on m.room_id = p.id
                  where c.id = p_room and m.employee_id = public.my_employee_id() and m.is_lead);
$$;

-- ห้องที่ฉันมีสิทธิ์หัวหน้า (ใช้ในหน้าเว็บ)
create or replace function public.my_lead_room_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r.id), '{}') from public.work_rooms r where public.is_room_lead(r.id);
$$;
grant execute on function public.my_lead_room_ids() to authenticated;

-- 0027 ตั้งอารดาเป็น ★ ในห้อง CONTENT ไว้ชั่วคราว — ตอนนี้ได้สิทธิ์จาก GC ROOM แล้ว จึงถอดออก (ธนกฤตยังเป็น ★ ห้อง CONTENT)
update public.work_room_members m set is_lead = false
  from public.employees e, public.work_rooms r
 where m.employee_id = e.id and m.room_id = r.id and r.key = 'content' and e.first_name = 'อารดา';
