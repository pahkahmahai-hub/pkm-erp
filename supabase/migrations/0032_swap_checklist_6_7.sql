-- =====================================================================
-- PKM ERP — 0032: เช็คลิสต์งานส่งห้างเดิม — สลับข้อ 6 กับ 7
--   เดิม: 6. อัพเข้าระบบห้างแล้ว / 7. สินค้าถึงห้างแล้ว  →  ใหม่: 6. สินค้าถึงห้างแล้ว / 7. อัพเข้าระบบห้างแล้ว
--   (งานที่สร้างจากตารางส่งห้างตั้งแต่นี้ไป เรียงถูกอยู่แล้ว)
-- =====================================================================
with pairs as (
  select a.id as a_id, b.id as b_id, a.sort_order as a_sort, b.sort_order as b_sort, a.is_done as a_done, b.is_done as b_done
    from public.work_checklist a
    join public.work_checklist b on b.task_id = a.task_id
   where a.label like '6.%อัพเข้าระบบ%' and b.label like '7.%ถึงห้าง%'
)
update public.work_checklist c set
  label = case when c.id = p.a_id then '7. อัพเข้าระบบห้างแล้ว' else '6. สินค้าถึงห้างแล้ว' end,
  sort_order = case when c.id = p.a_id then greatest(p.a_sort, p.b_sort) else least(p.a_sort, p.b_sort) end
  from pairs p
 where c.id in (p.a_id, p.b_id);
