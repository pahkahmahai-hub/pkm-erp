-- =====================================================================
-- PKM ERP — 0003: manual defect entries (create later / delete)
-- Run after 0002_stock.sql
-- =====================================================================

-- a defect found in the warehouse later (not at receiving): moves qty from good stock → defect bucket
create or replace function public.create_defect(
  p_product_id uuid, p_qty int, p_status public.defect_status, p_supplier_id uuid default null, p_note text default null,
  p_from_stock boolean default true
) returns public.defects
language plpgsql security definer set search_path = public as $$
declare v_d public.defects; v_uid uuid := public.current_app_user_id();
begin
  if p_qty is null or p_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
  if p_status not in ('review', 'return_pending') then raise exception 'สถานะเริ่มต้นต้องเป็น รอพิจารณา หรือ รอส่งคืน'; end if;

  insert into public.defects (product_id, qty, status, supplier_id, note, created_by, updated_by)
  values (p_product_id, p_qty, p_status, p_supplier_id, p_note, v_uid, v_uid)
  returning * into v_d;

  if p_from_stock then
    -- ย้ายจากสต็อกดีไปเป็นของเสีย
    perform public.apply_movement(p_product_id, 'defect_in', -p_qty, p_qty, 'defects', v_d.id, null, coalesce(p_note, 'พบของเสียในคลัง'));
  else
    -- ของเสียที่ไม่เคยนับอยู่ในสต็อก (เช่น เพิ่งเจอตอนแกะกล่องเก่า)
    perform public.apply_movement(p_product_id, 'defect_in', 0, p_qty, 'defects', v_d.id, null, coalesce(p_note, 'บันทึกของเสียย้อนหลัง'));
  end if;
  return v_d;
end $$;

-- delete an OPEN defect and undo its stock effect
create or replace function public.delete_defect(p_defect_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_d public.defects; v_from_stock boolean;
begin
  select * into v_d from public.defects where id = p_defect_id;
  if v_d.id is null then raise exception 'ไม่พบรายการ'; end if;
  if v_d.status not in ('review', 'return_pending') then raise exception 'ลบได้เฉพาะรายการที่ยังค้างอยู่ (รอพิจารณา/รอส่งคืน)'; end if;

  -- was good stock deducted when this defect was created? (manual from-stock entries have qty < 0 on their defect_in movement)
  select exists (select 1 from public.stock_movements where ref_table = 'defects' and ref_id = v_d.id and movement_type = 'defect_in' and qty < 0) into v_from_stock;

  if v_from_stock then
    perform public.apply_movement(v_d.product_id, 'defect_restore', v_d.qty, -v_d.qty, 'defects', v_d.id, null, 'ลบรายการของเสีย — คืนเข้าสต็อก');
  else
    perform public.apply_movement(v_d.product_id, 'defect_dispose', 0, -v_d.qty, 'defects', v_d.id, null, 'ลบรายการของเสีย');
  end if;
  delete from public.defects where id = p_defect_id;
end $$;
