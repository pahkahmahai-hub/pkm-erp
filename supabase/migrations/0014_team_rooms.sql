-- =====================================================================
-- PKM ERP — 0014: ห้องคุยงานเพิ่ม 2 ห้อง (GC ROOM, SW ROOM)
--   สมาชิก = พนักงานในทีมนั้นทั้งหมด (ตามทีมในทะเบียนพนักงาน) · ผู้บริหาร (ธเนษฐ, สุมนวินีต์) เห็นทุกห้องอยู่แล้ว
-- =====================================================================
insert into public.work_rooms (key, name, color, description, sort_order) values
  ('gc-room', 'GC ROOM', '#7c3aed', 'ทีม Graphic & Content ทั้งทีม + ผู้บริหาร', 1),
  ('sw-room', 'SW ROOM', '#c2410c', 'ทีม Sale & Warehouse ทั้งทีม + ผู้บริหาร', 2)
on conflict (key) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

-- ลำดับห้อง: ห้องหลัก (TEAMWORK, GC ROOM, SW ROOM) แล้วค่อยห้องย่อย
update public.work_rooms set sort_order = case key when 'teamwork' then 0 when 'gc-room' then 1 when 'sw-room' then 2
  when 'office' then 10 when 'operation' then 11 when 'online' then 12 when 'graphic' then 13 when 'visual' then 14 when 'content' then 15 else sort_order end;

insert into public.work_room_members (room_id, employee_id, is_lead)
select r.id, e.id, false
  from public.employees e
  join public.teams t on t.id = e.team_id
  join public.work_rooms r on r.key = case t.abbrev when 'GC' then 'gc-room' when 'SW' then 'sw-room' end
 where e.status <> 'resigned'
on conflict do nothing;
