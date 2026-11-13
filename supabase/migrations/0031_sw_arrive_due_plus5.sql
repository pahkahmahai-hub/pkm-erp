-- =====================================================================
-- PKM ERP — 0031: งานส่งห้างที่มีอยู่แล้ว (SW ROOM) — กำหนดถึงห้าง = กำหนดจัดเสร็จ + 5 วัน
--   แก้เฉพาะงานที่ยังเป็นค่าที่ระบบตั้งให้ (+2) หรือยังว่าง · งานที่มีคนกรอกวันเองไม่แตะ
--   งานใหม่ต่อจากนี้: ว่าง = จัดเสร็จ + 2 วันเหมือนเดิม
-- =====================================================================
update public.work_tasks t set arrive_due = t.due_date + 5
  from public.work_rooms r
 where r.id = t.room_id and r.key = 'sw-room' and t.due_date is not null
   and (t.arrive_due is null or t.arrive_due = t.due_date + 2);
