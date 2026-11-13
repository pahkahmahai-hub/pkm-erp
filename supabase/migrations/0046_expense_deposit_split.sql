-- =====================================================================
-- PKM ERP — 0046: จ่ายมัดจำก่อน → แยกบิล "ส่วนที่เหลือ" รอจ่ายตามกำหนดของงานนั้น
--   บิลเดิม  → กลายเป็นบิลมัดจำ (1 บรรทัด = มัดจำ x%) จ่ายตอนนี้
--   บิลใหม่  → รายการเดิมครบ + บรรทัด "หักมัดจำที่จ่ายแล้ว" · ครบกำหนด/รอบจ่ายตามที่ใส่ (ระยะผลิตแต่ละงานไม่เท่ากัน)
--   VAT / หัก ณ ที่จ่าย คิดแยกตามยอดของแต่ละบิล (ไม่ซ้ำ) · รูปบิลคัดลอกไปด้วย · ใช้ "เข้าสต็อก" ที่บิลส่วนที่เหลือ
-- =====================================================================
alter table public.expenses add column if not exists parent_expense_id uuid references public.expenses(id) on delete set null;

create or replace function public.split_expense_deposit(p_id uuid, p_deposit numeric, p_due date, p_round date) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; c public.expenses; f numeric; base numeric; v_dep numeric; v_pct numeric; v_label text; it record; i int := 0; p1 text; p2 text;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  if e.status in ('cancelled', 'paid') then raise exception 'บิลที่จ่ายแล้ว/ยกเลิกแล้ว แยกมัดจำไม่ได้'; end if;
  if exists (select 1 from public.expenses where parent_expense_id = p_id) then raise exception 'บิลนี้แยกยอดคงเหลือไปแล้ว'; end if;
  if coalesce(e.deposit_amount, 0) > 0 then raise exception 'บิลนี้ใส่ "มัดจำที่จ่ายไปแล้ว" อยู่ — ลบออกก่อน'; end if;
  if coalesce(p_deposit, 0) <= 0 or p_deposit >= e.grand_total then raise exception 'ยอดมัดจำต้องมากกว่า 0 และน้อยกว่ายอดตามบิล'; end if;
  f := p_deposit / e.grand_total;
  base := e.subtotal - coalesce(e.discount_amount, 0);             -- ฐานก่อน VAT ตามโหมดของบิล
  v_dep := round(base * f, 2);
  v_pct := round(f * 100, 2);
  p1 := trim(trailing '.' from trim(trailing '0' from v_pct::text));
  p2 := trim(trailing '.' from trim(trailing '0' from (100 - v_pct)::text));
  select string_agg(description, ', ' order by line_no) into v_label from public.expense_items where expense_id = p_id;

  -- บิลใหม่: ส่วนที่เหลือ
  insert into public.expenses (company_id, exp_no, supplier_id, supplier_name, supplier_tax_id, supplier_address, supplier_branch, supplier_is_company, category_id, bill_no, bill_date, due_date,
      description, vat_mode, vat_rate, discount_amount, wht_pct, pay_round, note, status, created_by, parent_expense_id)
  values (e.company_id, public.next_expense_no(e.company_id, coalesce(p_due, current_date)), e.supplier_id, e.supplier_name, e.supplier_tax_id, e.supplier_address, e.supplier_branch, e.supplier_is_company,
      e.category_id, e.bill_no, e.bill_date, p_due,
      'ส่วนที่เหลือ ' || p2 || '% · ' || coalesce(e.description, left(v_label, 120)) || ' (มัดจำแล้วใน ' || e.exp_no || ')',
      e.vat_mode, e.vat_rate, e.discount_amount, e.wht_pct, coalesce(p_round, p_due), e.note,
      (case when e.status = 'approved' then 'approved' when e.status = 'draft' then 'draft' else 'pending' end)::public.expense_status, e.created_by, e.id)
  returning * into c;
  if c.status = 'approved' then update public.expenses set approved_by = e.approved_by, approved_at = now() where id = c.id; end if;
  for it in select * from public.expense_items where expense_id = p_id order by line_no loop
    i := i + 1;
    insert into public.expense_items (expense_id, line_no, description, qty, unit, unit_price, discount, material_id, product_id)
    values (c.id, i, it.description, it.qty, it.unit, it.unit_price, coalesce(it.discount, 0), it.material_id, it.product_id);
  end loop;
  insert into public.expense_items (expense_id, line_no, description, qty, unit, unit_price)
  values (c.id, i + 1, 'หักมัดจำที่จ่ายแล้ว ' || p1 || '% (' || e.exp_no || ')', 1, null, -v_dep);
  insert into public.expense_files (expense_id, path, kind) select c.id, path, kind from public.expense_files where expense_id = p_id;
  perform public.recalc_expense(c.id);

  -- บิลเดิม: เหลือแค่มัดจำ
  delete from public.expense_items where expense_id = p_id;
  insert into public.expense_items (expense_id, line_no, description, qty, unit, unit_price)
  values (p_id, 1, 'มัดจำ ' || p1 || '% · ' || coalesce(e.description, left(v_label, 150)) || ' (ยอดเต็ม ' || to_char(e.grand_total, 'FM999,999,990.00') || ' · ส่วนที่เหลือ ' || c.exp_no || ')', 1, null, v_dep);
  update public.expenses set discount_amount = 0, description = 'มัดจำ ' || p1 || '% · ' || coalesce(e.description, left(v_label, 120)) where id = p_id;
  return public.recalc_expense(p_id);
end $$;
grant execute on function public.split_expense_deposit(uuid, numeric, date, date) to authenticated;
