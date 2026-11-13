-- PKM ERP — 0036b: แก้ตั้งรหัสผ่าน PAYROLL ไม่ได้ (DELETE requires a WHERE clause)
create or replace function public.payroll_set_password(p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้บริหาร'; end if;
  if length(coalesce(p_new, '')) < 6 then raise exception 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัว'; end if;
  select password_hash into v_hash from public.payroll_secret where id = 1;
  if v_hash is not null and (p_old is null or crypt(p_old, v_hash) <> v_hash) then raise exception 'รหัสผ่านเดิมไม่ถูกต้อง'; end if;
  update public.payroll_secret set password_hash = crypt(p_new, gen_salt('bf', 10)) where id = 1;
  delete from public.payroll_sessions where true;   -- ทุกคนต้องปลดล็อกใหม่ (Supabase บังคับ DELETE ต้องมี WHERE)
end $$;
