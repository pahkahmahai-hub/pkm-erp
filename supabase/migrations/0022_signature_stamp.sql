-- =====================================================================
-- PKM ERP — 0022: ลายเซ็นผู้มีอำนาจ + ตราประทับบริษัท บนเอกสาร
--   อัปโหลดได้ที่ ขาย → ข้อมูลบริษัท (ผู้บริหาร) · ติ๊กแสดง/ไม่แสดงได้ตอนพิมพ์แต่ละใบ
-- =====================================================================
alter table public.companies
  add column if not exists signature_path text,
  add column if not exists stamp_path text;

insert into storage.buckets (id, name, public) values ('brand', 'brand', true) on conflict (id) do nothing;
drop policy if exists "brand read" on storage.objects;
drop policy if exists "brand admin write" on storage.objects;
drop policy if exists "brand admin update" on storage.objects;
drop policy if exists "brand admin delete" on storage.objects;
create policy "brand read"         on storage.objects for select using (bucket_id = 'brand');
create policy "brand admin write"  on storage.objects for insert to authenticated with check (bucket_id = 'brand' and public.is_admin());
create policy "brand admin update" on storage.objects for update to authenticated using (bucket_id = 'brand' and public.is_admin());
create policy "brand admin delete" on storage.objects for delete to authenticated using (bucket_id = 'brand' and public.is_admin());

-- แชท: ตอบกลับข้อความ (reply) — อ้างอิงข้อความต้นทาง
alter table public.work_room_messages add column if not exists reply_to uuid references public.work_room_messages(id) on delete set null;
