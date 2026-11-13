-- =====================================================================
-- PKM ERP — 0033: แนบไฟล์ใน PR / PO (ใบเสนอราคา supplier · รูปสินค้า/ตัวอย่าง · เอกสารอื่น)
--   เก็บใน bucket ส่วนตัว purchase-files/<doc_id>/… · เปิดดูผ่าน signed URL
--   เห็นได้เฉพาะคนที่เห็นเอกสารนั้น (ผู้บริหาร / ผู้สร้าง PR-PO) — ราคาทุนไม่หลุดถึงพนักงานอื่น
-- =====================================================================
create table if not exists public.purchase_doc_files (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.purchase_docs(id) on delete cascade,
  path        text not null,                 -- path ใน bucket purchase-files
  file_name   text not null,
  mime        text,
  size_bytes  bigint,
  kind        text not null default 'other' check (kind in ('quote', 'image', 'other')),
  note        text,
  uploaded_by uuid references public.app_users(id) default public.current_app_user_id(),
  created_at  timestamptz not null default now()
);
create index if not exists purchase_doc_files_doc on public.purchase_doc_files (doc_id, created_at);

alter table public.purchase_doc_files enable row level security;
create policy "purchase files read"   on public.purchase_doc_files for select to authenticated using (public.can_view_purchase(doc_id));
create policy "purchase files insert" on public.purchase_doc_files for insert to authenticated with check (public.can_view_purchase(doc_id));
create policy "purchase files delete" on public.purchase_doc_files for delete to authenticated using (public.is_admin() or uploaded_by = public.current_app_user_id());

-- doc id จาก path "<uuid>/…" (คืน null ถ้าไม่ใช่ uuid)
create or replace function public.purchase_file_doc(p_name text) returns uuid
language plpgsql immutable as $$
begin return split_part(p_name, '/', 1)::uuid; exception when others then return null; end $$;

insert into storage.buckets (id, name, public) values ('purchase-files', 'purchase-files', false) on conflict (id) do nothing;
create policy "purchase files obj read"   on storage.objects for select to authenticated using (bucket_id = 'purchase-files' and public.can_view_purchase(public.purchase_file_doc(name)));
create policy "purchase files obj write"  on storage.objects for insert to authenticated with check (bucket_id = 'purchase-files' and public.can_view_purchase(public.purchase_file_doc(name)));
create policy "purchase files obj delete" on storage.objects for delete to authenticated using (bucket_id = 'purchase-files' and (public.is_admin() or owner = auth.uid()));
