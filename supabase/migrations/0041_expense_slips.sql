-- =====================================================================
-- PKM ERP — 0041: แนบสลิปโอนเงิน / ไฟล์เพิ่มในค่าใช้จ่ายที่มีอยู่แล้ว
--   ใช้ตอน "จ่ายแล้ว + แนบสลิป" (ทีละใบ หรือหลายใบด้วยสลิปเดียว) และบันทึกด่วนจากมือถือ
-- =====================================================================
create or replace function public.add_expense_files(p_id uuid, p_files jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare e public.expenses; f jsonb; n int := 0;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์แนบไฟล์'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    if coalesce(f->>'path', '') = '' then continue; end if;
    insert into public.expense_files (expense_id, path, kind) values (p_id, f->>'path', coalesce(f->>'kind', 'slip'));
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.add_expense_files(uuid, jsonb) to authenticated;
