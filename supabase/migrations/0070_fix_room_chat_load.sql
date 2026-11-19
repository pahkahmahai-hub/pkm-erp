-- 0070: แก้แชทห้องโหลดไม่ขึ้นหลังรัน 0069
-- สาเหตุ: 0069 ผูก pinned_by → app_users ทำให้ work_room_messages มีลิงก์ไป app_users 2 เส้น (author_id, pinned_by)
-- หน้าแชทที่ดึง app_users(display_name, email) เลยเลือกไม่ได้ → error → แสดง "ยังไม่มีข้อความ" (ข้อความไม่ได้หาย)
alter table public.work_room_messages drop constraint if exists work_room_messages_pinned_by_fkey;
notify pgrst, 'reload schema';
