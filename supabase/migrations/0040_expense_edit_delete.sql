-- =====================================================================
-- PKM ERP — 0040: แก้ไข / ลบ ค่าใช้จ่าย
--   แก้ไข: ผู้บันทึกแก้ได้ก่อนอนุมัติ (เหมือนเดิม) · ผู้บริหารแก้ได้ทุกสถานะ (สถานะเดิมคงอยู่)
--   ลบถาวร: ผู้บริหารลบได้ทุกสถานะ · ผู้บันทึกลบของตัวเองได้เมื่อยังไม่อนุมัติ/ถูกตีกลับ/ยกเลิก
--           ปลดการผูกกับ PO / ใบสั่งผลิต · หนังสือรับรองหัก ณ ที่จ่ายที่ออกไปแล้วยังอยู่ (ไม่ผูกบิล)
-- =====================================================================
create or replace function public.update_expense(
  p_id uuid, p_supplier uuid, p_supplier_name text, p_supplier_tax_id text, p_supplier_address text, p_supplier_branch text, p_supplier_is_company boolean,
  p_category uuid, p_bill_no text, p_bill_date date, p_due_date date, p_description text, p_vat_mode public.vat_mode, p_discount numeric, p_wht_pct numeric,
  p_pay_round date, p_note text, p_items jsonb
) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; it jsonb; i int := 0;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status = 'cancelled' then raise exception 'รายการนี้ถูกยกเลิกแล้ว'; end if;
  if e.status not in ('draft', 'pending', 'rejected') and not public.is_admin() then raise exception 'รายการที่อนุมัติแล้ว แก้ได้เฉพาะผู้บริหาร'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'แก้ได้เฉพาะผู้บันทึกหรือ admin'; end if;
  update public.expenses set supplier_id = p_supplier, supplier_name = p_supplier_name, supplier_tax_id = p_supplier_tax_id, supplier_address = p_supplier_address, supplier_branch = p_supplier_branch,
    supplier_is_company = coalesce(p_supplier_is_company, true), category_id = p_category, bill_no = p_bill_no, bill_date = coalesce(p_bill_date, bill_date), due_date = p_due_date,
    description = p_description, vat_mode = coalesce(p_vat_mode, 'none'), discount_amount = coalesce(p_discount, 0), wht_pct = coalesce(p_wht_pct, 0), pay_round = p_pay_round, note = p_note,
    status = (case when status = 'rejected' then 'pending'::public.expense_status else status end), review_note = case when status = 'rejected' then null else review_note end
  where id = p_id;
  delete from public.expense_items where expense_id = p_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.expense_items (expense_id, line_no, description, qty, unit, unit_price, material_id, product_id)
    values (p_id, i, coalesce(it->>'description', ''), coalesce((it->>'qty')::numeric, 1), nullif(it->>'unit', ''), coalesce((it->>'unit_price')::numeric, 0),
            nullif(it->>'material_id', '')::uuid, nullif(it->>'product_id', '')::uuid);
  end loop;
  return public.recalc_expense(p_id);
end $$;

create or replace function public.delete_expense(p_id uuid) returns setof text
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if not public.is_admin() then
    if e.created_by is distinct from public.current_app_user_id() then raise exception 'ลบได้เฉพาะผู้บันทึกหรือผู้บริหาร'; end if;
    if e.status not in ('draft', 'pending', 'rejected', 'cancelled') then raise exception 'รายการที่อนุมัติ/จ่ายแล้ว ลบได้เฉพาะผู้บริหาร'; end if;
  end if;
  update public.purchase_docs set expense_id = null where expense_id = p_id;
  update public.production_orders set expense_id = null where expense_id = p_id;
  return query select path from public.expense_files where expense_id = p_id;   -- ให้หน้าเว็บลบไฟล์ใน storage ต่อ
  delete from public.expenses where id = p_id;
end $$;
grant execute on function public.delete_expense(uuid) to authenticated;
