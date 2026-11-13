-- =====================================================================
-- PKM ERP — 0043: บันทึกค่าใช้จ่ายเข้าสต็อก + คลัง "อุปกรณ์ Display"
--   • หมวดวัสดุใหม่: display (อุปกรณ์ Display / ตกแต่งบูธ)
--   • ปุ่มในบิลค่าใช้จ่าย → เลือกแต่ละรายการเข้า สินค้า / แพคเกจจิ้ง / อุปกรณ์ / อุปกรณ์ Display
--     วัสดุ: เลือกของเดิม หรือสร้างรายการใหม่ · รับเข้า + คิดต้นทุนเฉลี่ย · สินค้า: สร้างใบรับเข้าคลังใหญ่
--     รายการที่เข้าแล้วจะไม่เข้าซ้ำ
-- =====================================================================
alter type public.material_kind add value if not exists 'display';

alter table public.expense_items add column if not exists stocked_at timestamptz;
alter table public.expense_items add column if not exists stocked_qty numeric(12,2);

create or replace function public.expense_to_stock(p_expense uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.expenses; ln jsonb; it public.expense_items; v_qty numeric; v_mat uuid; v_unit_cost numeric;
        v_prod jsonb := '[]'::jsonb; v_rc public.receipts; n_mat int := 0; n_prod int := 0;
begin
  if not (public.is_admin() or public.can_expense()) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into e from public.expenses where id = p_expense;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status = 'cancelled' then raise exception 'รายการนี้ถูกยกเลิกแล้ว'; end if;
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into it from public.expense_items where id = (ln->>'item_id')::uuid and expense_id = p_expense;
    if it.id is null then raise exception 'ไม่พบรายการในบิล'; end if;
    if it.stocked_at is not null then continue; end if;
    v_qty := coalesce((ln->>'qty')::numeric, it.qty);
    if v_qty <= 0 then continue; end if;
    -- ต้นทุน/หน่วยไม่รวม VAT (ถ้าบิลรวม VAT แล้ว ถอด 7% ออก)
    v_unit_cost := round(case when e.vat_mode = 'inclusive' then it.unit_price / 1.07 else it.unit_price end * it.qty / v_qty, 2);
    if ln->>'target' = 'product' then
      if nullif(ln->>'product_id', '') is null then raise exception 'เลือกสินค้าให้ "%"', it.description; end if;
      v_prod := v_prod || jsonb_build_object('product_id', (ln->>'product_id')::uuid, 'qty', round(v_qty)::int, 'condition', 'good', 'unit_cost', v_unit_cost, 'note', 'จาก ' || e.exp_no);
      update public.expense_items set product_id = (ln->>'product_id')::uuid, stocked_at = now(), stocked_qty = v_qty where id = it.id;
      n_prod := n_prod + 1;
    elsif ln->>'target' = 'material' then
      v_mat := nullif(ln->>'material_id', '')::uuid;
      if v_mat is null then
        if coalesce(ln->>'new_name', '') = '' or coalesce(ln->>'kind', '') = '' then raise exception 'ใส่ชื่อและหมวดของรายการใหม่ "%"', it.description; end if;
        insert into public.materials (kind, name, unit, qty) values ((ln->>'kind')::public.material_kind, ln->>'new_name', coalesce(nullif(ln->>'unit', ''), 'ชิ้น'), 0) returning id into v_mat;
      end if;
      perform public.move_material(v_mat, 'receive', v_qty, 'รับจากค่าใช้จ่าย ' || e.exp_no || coalesce(' · ' || e.supplier_name, ''), e.supplier_id);
      perform public.material_receive_cost(v_mat, v_qty, v_unit_cost);
      update public.material_movements set unit_cost = v_unit_cost, ref_type = 'expense', ref_id = e.id
       where id = (select id from public.material_movements where material_id = v_mat order by created_at desc limit 1);
      update public.expense_items set material_id = v_mat, stocked_at = now(), stocked_qty = v_qty where id = it.id;
      n_mat := n_mat + 1;
    end if;
  end loop;
  if jsonb_array_length(v_prod) > 0 then
    v_rc := public.create_receipt(e.supplier_id, coalesce(e.bill_no, e.exp_no), coalesce(e.bill_date, current_date),
              (case when e.status = 'paid' then 'paid' else 'unpaid' end)::public.payment_status, 'รับเข้าจากค่าใช้จ่าย ' || e.exp_no, v_prod);
  end if;
  return jsonb_build_object('materials', n_mat, 'products', n_prod, 'receipt_id', v_rc.id);
end $$;
grant execute on function public.expense_to_stock(uuid, jsonb) to authenticated;
