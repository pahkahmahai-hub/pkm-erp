-- =====================================================================
-- PKM ERP — 0014: ห้องคุยงานเพิ่ม 2 ห้อง (GC ROOM, SW ROOM)
--   สมาชิก = พนักงานในทีมนั้นทั้งหมด (ตามทีมในทะเบียนพนักงาน) · ผู้บริหาร (ธเนษฐ, สุมนวินีต์) เห็นทุกห้องอยู่แล้ว
-- =====================================================================
insert into public.work_rooms (key, name, color, description, sort_order) values
  ('gc-room', 'GC ROOM', '#7c3aed', 'ทีม Graphic & Content ทั้งทีม + ผู้บริหาร', 7),
  ('sw-room', 'SW ROOM', '#c2410c', 'ทีม Sale & Warehouse ทั้งทีม + ผู้บริหาร', 8)
on conflict (key) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.work_room_members (room_id, employee_id, is_lead)
select r.id, e.id, false
  from public.employees e
  join public.teams t on t.id = e.team_id
  join public.work_rooms r on r.key = case t.abbrev when 'GC' then 'gc-room' when 'SW' then 'sw-room' end
 where e.status = 'active'
on conflict do nothing;
