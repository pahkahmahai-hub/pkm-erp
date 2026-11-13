-- =====================================================================
-- PKM ERP — 0044: ส่วนลดรายบรรทัดในบิลค่าใช้จ่าย (บาท — หน้าเว็บกรอกเป็น % ได้)
--   จำนวนเงินต่อบรรทัด = จำนวน × ราคา − ส่วนลด · ส่วนลดท้ายบิลยังใช้ได้ (หน้าเว็บเลือก บาท / %)
--   ต้นทุนเข้าสต็อกคิดหลังหักส่วนลดทั้ง 2 แบบ
-- =====================================================================
alter table public.expense_items add column if not exists discount numeric(14,2) not null default 0;

create or replace function public.recalc_expense(p_id uuid) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; v_sub numeric; v_after numeric; v_net numeric; v_vat numeric; v_grand numeric; v_wht numeric;
begin
  select * into e from public.expenses where id = p_id;
  update public.expense_items set amount = round(qty * unit_price - coalesce(discount, 0), 2) where expense_id = p_id;
  select coalesce(sum(amount), 0) into v_sub from public.expense_items where expense_id = p_id;
  v_after := v_sub - coalesce(e.discount_amount, 0);
  if e.vat_mode = 'inclusive' then
    v_grand := v_after; v_net := round(v_after * 100 / (100 + e.vat_rate), 2); v_vat := v_grand - v_net;
  elsif e.vat_mode = 'exclusive' then
    v_net := v_after; v_vat := round(v_after * e.vat_rate / 100, 2); v_grand := v_net + v_vat;
  else
    v_net := v_after; v_vat := 0; v_grand := v_after;
  end if;
  v_wht := round(v_net * coalesce(e.wht_pct, 0) / 100, 2);
  update public.expenses set subtotal = v_sub, net_before_vat = v_net, vat_amount = v_vat, grand_total = v_grand, wht_amount = v_wht,
         net_pay = v_grand - v_wht, updated_at = now()
   where id = p_id returning * into e;
  return e;
end $$;

-- ใส่ส่วนลดรายบรรทัด (เรียงตาม line_no) แล้วคำนวณยอดใหม่ — เรียกต่อจาก create_expense / update_expense
create or replace function public.set_expense_item_discounts(p_id uuid, p_discounts numeric[]) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.expense_items i set discount = coalesce(p_discounts[i.line_no], 0) where i.expense_id = p_id;
  return public.recalc_expense(p_id);
end $$;
grant execute on function public.set_expense_item_discounts(uuid, numeric[]) to authenticated;

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
    -- หักส่วนลดรายบรรทัด (amount) และเฉลี่ยส่วนลดท้ายบิลตามสัดส่วน
    v_unit_cost := round(it.amount * (1 - coalesce(e.discount_amount, 0) / nullif(e.subtotal, 0)) / case when e.vat_mode = 'inclusive' then 1.07 else 1 end / v_qty, 2);
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
