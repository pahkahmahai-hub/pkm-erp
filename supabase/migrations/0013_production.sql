-- =====================================================================
-- PKM ERP — 0013: โมดูลการผลิต
--   • วัสดุเพิ่มประเภท "อุปกรณ์" (accessory) + ต้นทุน/หน่วยของวัสดุ (admin เห็น)
--   • BOM ต่อสินค้า: ผ้า (ผืนละกี่ชิ้น → ระบบคิดผืน/ชิ้น) + แพคเกจจิ้ง + อุปกรณ์ + % เผื่อเสีย + ค่าจ้าง/ชิ้นมาตรฐาน
--   • ใบสั่งผลิต (MO) → โรงงาน/ชุมชน (contacts supplier) → เบิกวัสดุตาม BOM (ตัดสต็อกวัสดุ) → รับสินค้าสำเร็จรูป (เข้าคลังใหญ่, ของเสีย)
--   • ค่าจ้าง = ชิ้นที่รับ × เรท → สร้างบิลค่าใช้จ่าย (รออนุมัติ) · ต้นทุนสินค้า = วัสดุที่เบิกจริง + ค่าจ้าง (เฉลี่ยต่อชิ้น)
--   • เลขที่: MO + YYYYMM + 4 หลัก, ใบเบิกวัสดุ MI + YYYYMM + 4 หลัก
-- =====================================================================

alter type public.material_kind add value if not exists 'accessory';
alter table public.materials add column if not exists unit_cost numeric(12,2) not null default 0;        -- ต้นทุนเฉลี่ย/หน่วย (คำนวณจากการรับเข้า)
alter table public.material_movements add column if not exists unit_cost numeric(12,2);
alter table public.material_movements add column if not exists ref_type text;                           -- 'production_issue' | 'purchase' | ...
alter table public.material_movements add column if not exists ref_id uuid;

create type public.mo_status as enum ('draft', 'issued', 'in_progress', 'partial', 'completed', 'cancelled');

-- ---------------------------------------------------------------------
-- BOM
-- ---------------------------------------------------------------------
create table public.boms (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  name          text not null default 'มาตรฐาน',
  wage_per_piece numeric(12,2) not null default 0,      -- ค่าจ้างผลิตมาตรฐาน/ชิ้น (ใช้เป็นค่าเริ่มต้นในใบสั่งผลิต)
  note          text,
  is_active     boolean not null default true,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index boms_one_active_per_product on public.boms (product_id) where is_active;

create table public.bom_items (
  id              uuid primary key default gen_random_uuid(),
  bom_id          uuid not null references public.boms(id) on delete cascade,
  material_id     uuid not null references public.materials(id),
  qty_per_piece   numeric(12,4) not null,               -- หน่วยวัสดุต่อสินค้า 1 ชิ้น (ผ้า: 1/ผืนละกี่ชิ้น)
  pieces_per_unit numeric(10,2),                        -- สำหรับผ้า: 1 ผืน ทำได้กี่ชิ้น (เก็บไว้แสดง/แก้)
  waste_pct       numeric(5,2) not null default 0,      -- เผื่อเสีย %
  note            text,
  sort_order      int not null default 1
);
create index on public.bom_items (bom_id);

create or replace function public.save_bom(p_product uuid, p_name text, p_wage numeric, p_note text, p_items jsonb) returns public.boms
language plpgsql security definer set search_path = public as $$
declare b public.boms; it jsonb; i int := 0; v_ppu numeric; v_qpp numeric;
begin
  if not public.can_sell() then raise exception 'ไม่มีสิทธิ์แก้ BOM'; end if;
  select * into b from public.boms where product_id = p_product and is_active;
  if b.id is null then
    insert into public.boms (product_id, name, wage_per_piece, note, created_by) values (p_product, coalesce(p_name, 'มาตรฐาน'), coalesce(p_wage, 0), p_note, public.current_app_user_id()) returning * into b;
  else
    update public.boms set name = coalesce(p_name, name), wage_per_piece = coalesce(p_wage, wage_per_piece), note = p_note, updated_at = now() where id = b.id returning * into b;
  end if;
  delete from public.bom_items where bom_id = b.id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    v_ppu := nullif(it->>'pieces_per_unit', '')::numeric;
    v_qpp := coalesce(nullif(it->>'qty_per_piece', '')::numeric, case when v_ppu is not null and v_ppu > 0 then round(1 / v_ppu, 4) end);
    if v_qpp is null or v_qpp <= 0 then raise exception 'จำนวนวัสดุต่อชิ้นไม่ถูกต้อง'; end if;
    insert into public.bom_items (bom_id, material_id, qty_per_piece, pieces_per_unit, waste_pct, note, sort_order)
    values (b.id, (it->>'material_id')::uuid, v_qpp, v_ppu, coalesce((it->>'waste_pct')::numeric, 0), nullif(it->>'note', ''), i);
  end loop;
  return b;
end $$;

-- ---------------------------------------------------------------------
-- Production orders (ใบสั่งผลิต)
-- ---------------------------------------------------------------------
create table public.production_orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  doc_no        text not null,
  doc_date      date not null default (now() at time zone 'Asia/Bangkok')::date,
  due_date      date,
  factory_id    uuid references public.contacts(id),
  factory_name  text,
  notes         text,                                   -- พิมพ์บนใบสั่งผลิต
  internal_note text,
  status        public.mo_status not null default 'draft',
  material_cost numeric(14,2) not null default 0,       -- วัสดุที่เบิกจริง (ต้นทุน)
  wage_total    numeric(14,2) not null default 0,       -- ค่าจ้างตามที่รับจริง
  expense_id    uuid references public.expenses(id),
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, doc_no)
);
create index on public.production_orders (status);
create index on public.production_orders (factory_id);

create table public.production_order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.production_orders(id) on delete cascade,
  line_no       int not null default 1,
  product_id    uuid not null references public.products(id),
  bom_id        uuid references public.boms(id),
  qty_ordered   int not null,
  qty_received  int not null default 0,
  qty_defect    int not null default 0,
  wage_per_piece numeric(12,2) not null default 0,
  note          text
);
create index on public.production_order_items (order_id);

-- ใบเบิกวัสดุ (ให้โรงงาน)
create table public.production_issues (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.production_orders(id) on delete cascade,
  issue_no      text not null,
  issued_at     date not null default (now() at time zone 'Asia/Bangkok')::date,
  note          text,
  total_cost    numeric(14,2) not null default 0,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now()
);
create table public.production_issue_items (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid not null references public.production_issues(id) on delete cascade,
  material_id   uuid not null references public.materials(id),
  qty           numeric(12,2) not null,
  unit_cost     numeric(12,2) not null default 0,
  note          text
);
-- รับสินค้าสำเร็จรูป
create table public.production_receipts (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.production_orders(id) on delete cascade,
  received_at   date not null default (now() at time zone 'Asia/Bangkok')::date,
  stock_receipt_id uuid references public.receipts(id),
  lines         jsonb not null,                          -- [{item_id, qty_good, qty_defect}]
  note          text,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now()
);
create table public.production_counters (
  company_id uuid not null references public.companies(id), prefix text not null, yyyymm text not null, last_no int not null default 0,
  primary key (company_id, prefix, yyyymm)
);

create or replace function public.next_production_no(p_company uuid, p_prefix text, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_ym text := to_char(coalesce(p_date, current_date), 'YYYYMM'); v_n int;
begin
  insert into public.production_counters (company_id, prefix, yyyymm, last_no) values (p_company, p_prefix, v_ym, 1)
  on conflict (company_id, prefix, yyyymm) do update set last_no = public.production_counters.last_no + 1 returning last_no into v_n;
  return p_prefix || v_ym || to_char(v_n, 'FM0000');
end $$;

create or replace function public.can_produce() returns boolean
language sql stable security definer set search_path = public as $$ select public.can_sell(); $$;

-- create / update order (draft only)
create or replace function public.create_production_order(p_company uuid, p_factory uuid, p_factory_name text, p_doc_date date, p_due_date date, p_notes text, p_internal_note text, p_items jsonb)
returns public.production_orders language plpgsql security definer set search_path = public as $$
declare o public.production_orders; it jsonb; i int := 0; v_bom public.boms;
begin
  if not public.can_produce() then raise exception 'ไม่มีสิทธิ์เปิดใบสั่งผลิต'; end if;
  insert into public.production_orders (company_id, doc_no, doc_date, due_date, factory_id, factory_name, notes, internal_note, created_by)
  values (p_company, public.next_production_no(p_company, 'MO', coalesce(p_doc_date, current_date)), coalesce(p_doc_date, current_date), p_due_date, p_factory, p_factory_name, p_notes, p_internal_note, public.current_app_user_id())
  returning * into o;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    select * into v_bom from public.boms where product_id = (it->>'product_id')::uuid and is_active;
    insert into public.production_order_items (order_id, line_no, product_id, bom_id, qty_ordered, wage_per_piece, note)
    values (o.id, i, (it->>'product_id')::uuid, v_bom.id, coalesce((it->>'qty')::int, 0), coalesce(nullif(it->>'wage_per_piece', '')::numeric, v_bom.wage_per_piece, 0), nullif(it->>'note', ''));
  end loop;
  return o;
end $$;

create or replace function public.update_production_order(p_id uuid, p_factory uuid, p_factory_name text, p_doc_date date, p_due_date date, p_notes text, p_internal_note text, p_items jsonb)
returns public.production_orders language plpgsql security definer set search_path = public as $$
declare o public.production_orders; it jsonb; i int := 0; v_bom public.boms;
begin
  select * into o from public.production_orders where id = p_id;
  if o.id is null then raise exception 'ไม่พบใบสั่งผลิต'; end if;
  if o.status <> 'draft' then raise exception 'แก้ไขได้เฉพาะฉบับร่าง (ยังไม่เบิกวัสดุ)'; end if;
  if not (public.is_admin() or o.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.production_orders set factory_id = p_factory, factory_name = p_factory_name, doc_date = coalesce(p_doc_date, doc_date), due_date = p_due_date, notes = p_notes, internal_note = p_internal_note, updated_at = now() where id = p_id;
  delete from public.production_order_items where order_id = p_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    select * into v_bom from public.boms where product_id = (it->>'product_id')::uuid and is_active;
    insert into public.production_order_items (order_id, line_no, product_id, bom_id, qty_ordered, wage_per_piece, note)
    values (p_id, i, (it->>'product_id')::uuid, v_bom.id, coalesce((it->>'qty')::int, 0), coalesce(nullif(it->>'wage_per_piece', '')::numeric, v_bom.wage_per_piece, 0), nullif(it->>'note', ''));
  end loop;
  select * into o from public.production_orders where id = p_id;
  return o;
end $$;

-- วัสดุที่ต้องเบิกตาม BOM (รวมทุกสินค้าในใบ) หัก/เทียบกับที่เบิกไปแล้ว
create or replace function public.mo_requirements(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with need as (
    select bi.material_id, sum(oi.qty_ordered * bi.qty_per_piece * (1 + bi.waste_pct / 100)) as qty
      from public.production_order_items oi join public.bom_items bi on bi.bom_id = oi.bom_id
     where oi.order_id = p_order group by bi.material_id
  ),
  issued as (
    select ii.material_id, sum(ii.qty) as qty from public.production_issue_items ii join public.production_issues pi on pi.id = ii.issue_id where pi.order_id = p_order group by ii.material_id
  ),
  nobom as (select oi.product_id, p.name from public.production_order_items oi join public.products p on p.id = oi.product_id where oi.order_id = p_order and oi.bom_id is null)
  select jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('material_id', m.id, 'code', m.code, 'name', m.name, 'kind', m.kind, 'unit', m.unit, 'stock', m.qty, 'unit_cost', m.unit_cost,
                 'required', round(coalesce(n.qty, 0), 2), 'issued', round(coalesce(i.qty, 0), 2), 'remaining', round(greatest(coalesce(n.qty, 0) - coalesce(i.qty, 0), 0), 2)) order by m.kind, m.name), '[]'::jsonb)
                from public.materials m left join need n on n.material_id = m.id left join issued i on i.material_id = m.id where n.material_id is not null or i.material_id is not null),
    'no_bom', (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name)), '[]'::jsonb) from nobom)
  );
$$;

-- เบิกวัสดุให้โรงงาน (ตัดสต็อกวัสดุ) — p_lines [{material_id, qty, note}] (ค่าเริ่มต้นจาก mo_requirements.remaining)
create or replace function public.issue_production_materials(p_order uuid, p_lines jsonb, p_issued_at date default null, p_note text default null)
returns public.production_issues language plpgsql security definer set search_path = public as $$
declare o public.production_orders; iss public.production_issues; ln jsonb; m public.materials; v_qty numeric; v_total numeric := 0;
begin
  if not public.can_produce() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into o from public.production_orders where id = p_order;
  if o.id is null then raise exception 'ไม่พบใบสั่งผลิต'; end if;
  if o.status in ('completed', 'cancelled') then raise exception 'ใบสั่งผลิตปิดแล้ว'; end if;
  insert into public.production_issues (order_id, issue_no, issued_at, note, created_by)
  values (p_order, public.next_production_no(o.company_id, 'MI', coalesce(p_issued_at, current_date)), coalesce(p_issued_at, current_date), p_note, public.current_app_user_id()) returning * into iss;
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce((ln->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    select * into m from public.materials where id = (ln->>'material_id')::uuid;
    if m.id is null then raise exception 'ไม่พบวัสดุ'; end if;
    perform public.move_material(m.id, 'out', -v_qty, 'เบิกผลิต ' || o.doc_no || coalesce(' → ' || o.factory_name, ''), o.factory_id);
    update public.material_movements set unit_cost = m.unit_cost, ref_type = 'production_issue', ref_id = iss.id
     where id = (select id from public.material_movements where material_id = m.id order by created_at desc limit 1);
    insert into public.production_issue_items (issue_id, material_id, qty, unit_cost, note) values (iss.id, m.id, v_qty, m.unit_cost, nullif(ln->>'note', ''));
    v_total := v_total + round(v_qty * m.unit_cost, 2);
  end loop;
  update public.production_issues set total_cost = v_total where id = iss.id;
  update public.production_orders set material_cost = material_cost + v_total, status = case when status = 'draft' then 'issued'::public.mo_status else status end, updated_at = now() where id = p_order;
  select * into iss from public.production_issues where id = iss.id;
  return iss;
end $$;

-- รับสินค้าสำเร็จรูปเข้าคลังใหญ่ — p_lines [{item_id, qty_good, qty_defect}]
create or replace function public.receive_production(p_order uuid, p_lines jsonb, p_received_at date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.production_orders; ln jsonb; it public.production_order_items; v_items jsonb := '[]'::jsonb; v_rc public.receipts; v_good int; v_def int;
        v_wage numeric := 0; v_total_ordered int; v_total_recv int; v_unit_cost numeric; v_total_pieces int;
begin
  if not public.can_produce() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into o from public.production_orders where id = p_order;
  if o.id is null then raise exception 'ไม่พบใบสั่งผลิต'; end if;
  if o.status in ('completed', 'cancelled') then raise exception 'ใบสั่งผลิตปิดแล้ว'; end if;
  select coalesce(sum(qty_ordered), 0) into v_total_pieces from public.production_order_items where order_id = p_order;
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_good := coalesce((ln->>'qty_good')::int, 0); v_def := coalesce((ln->>'qty_defect')::int, 0);
    if v_good + v_def <= 0 then continue; end if;
    select * into it from public.production_order_items where id = (ln->>'item_id')::uuid and order_id = p_order;
    if it.id is null then raise exception 'ไม่พบรายการ'; end if;
    -- ต้นทุน/ชิ้น = วัสดุที่เบิกทั้งใบ เฉลี่ยต่อชิ้นที่สั่ง + ค่าจ้าง/ชิ้น
    v_unit_cost := round(case when v_total_pieces > 0 then o.material_cost / v_total_pieces else 0 end + it.wage_per_piece, 2);
    if v_good > 0 then v_items := v_items || jsonb_build_object('product_id', it.product_id, 'qty', v_good, 'condition', 'good', 'unit_cost', v_unit_cost, 'note', 'ผลิต ' || o.doc_no); end if;
    if v_def > 0 then v_items := v_items || jsonb_build_object('product_id', it.product_id, 'qty', v_def, 'condition', 'defect', 'unit_cost', v_unit_cost, 'note', 'ผลิต ' || o.doc_no || ' (ของเสีย)', 'defect_action', 'review'); end if;
    update public.production_order_items set qty_received = qty_received + v_good, qty_defect = qty_defect + v_def where id = it.id;
    v_wage := v_wage + round((v_good + v_def) * it.wage_per_piece, 2);
    update public.products set cost = v_unit_cost where id = it.product_id and v_unit_cost > 0;
  end loop;
  if jsonb_array_length(v_items) > 0 then
    v_rc := public.create_receipt(o.factory_id, o.doc_no, coalesce(p_received_at, current_date), 'unpaid', 'รับจากการผลิต ' || o.doc_no || coalesce(' · ' || o.factory_name, '') || coalesce(' · ' || p_note, ''), v_items);
  end if;
  insert into public.production_receipts (order_id, received_at, stock_receipt_id, lines, note, created_by) values (p_order, coalesce(p_received_at, current_date), v_rc.id, p_lines, p_note, public.current_app_user_id());
  select sum(qty_ordered), sum(qty_received + qty_defect) into v_total_ordered, v_total_recv from public.production_order_items where order_id = p_order;
  update public.production_orders set wage_total = wage_total + v_wage, status = (case when v_total_recv >= v_total_ordered then 'completed' else 'partial' end)::public.mo_status, updated_at = now() where id = p_order;
  return jsonb_build_object('receipt_no', v_rc.receipt_no, 'receipt_id', v_rc.id, 'wage', v_wage, 'status', (select status from public.production_orders where id = p_order));
end $$;

-- บิลค่าจ้างผลิต (ค่าใช้จ่าย รออนุมัติ) จากใบสั่งผลิต — ตามชิ้นที่รับแล้วทั้งหมด
create or replace function public.expense_from_production(p_order uuid, p_bill_no text default null, p_bill_date date default null, p_wht_pct numeric default 3) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare o public.production_orders; e public.expenses; v_items jsonb; v_name text; v_cat uuid; c public.contacts;
begin
  select * into o from public.production_orders where id = p_order;
  if o.id is null then raise exception 'ไม่พบใบสั่งผลิต'; end if;
  if o.expense_id is not null then raise exception 'ใบสั่งผลิตนี้สร้างบิลค่าจ้างแล้ว'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', 'ค่าจ้างผลิต ' || p.name, 'qty', oi.qty_received + oi.qty_defect, 'unit', 'ชิ้น', 'unit_price', oi.wage_per_piece, 'product_id', oi.product_id) order by oi.line_no), '[]'::jsonb)
    into v_items from public.production_order_items oi join public.products p on p.id = oi.product_id where oi.order_id = p_order and (oi.qty_received + oi.qty_defect) > 0 and oi.wage_per_piece > 0;
  if jsonb_array_length(v_items) = 0 then raise exception 'ยังไม่มีชิ้นที่รับ หรือค่าจ้างเป็น 0'; end if;
  select id into v_cat from public.expense_categories where code = 'production';
  select * into c from public.contacts where id = o.factory_id;
  v_name := coalesce(o.factory_name, c.name, 'โรงงาน');
  e := public.create_expense(o.company_id, o.factory_id, v_name, c.tax_id, concat_ws(' ', c.address, c.address2, c.address3, c.postcode), c.branch_code, (v_name ~* 'บริษัท|บจก|หจก|จำกัด'),
         v_cat, coalesce(p_bill_no, o.doc_no), coalesce(p_bill_date, current_date), null, 'ค่าจ้างผลิตตามใบสั่งผลิต ' || o.doc_no, 'none', 0, coalesce(p_wht_pct, 3), null, 'สร้างจาก ' || o.doc_no, v_items, '[]'::jsonb, null, true);
  update public.production_orders set expense_id = e.id, updated_at = now() where id = p_order;
  return e;
end $$;

create or replace function public.cancel_production_order(p_id uuid, p_reason text default null) returns public.production_orders
language plpgsql security definer set search_path = public as $$
declare o public.production_orders;
begin
  select * into o from public.production_orders where id = p_id;
  if o.id is null then raise exception 'ไม่พบใบสั่งผลิต'; end if;
  if not (public.is_admin() or o.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  if o.status not in ('draft') and not public.is_admin() then raise exception 'ยกเลิกใบที่เบิกวัสดุแล้วได้เฉพาะผู้บริหาร (วัสดุที่เบิกไปแล้วให้รับคืนในคลังวัสดุเอง)'; end if;
  update public.production_orders set status = 'cancelled', internal_note = coalesce(p_reason, internal_note), updated_at = now() where id = p_id returning * into o;
  return o;
end $$;

create or replace function public.production_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open',       (select count(*) from public.production_orders where status in ('draft', 'issued', 'in_progress', 'partial')),
    'open_pieces',(select coalesce(sum(oi.qty_ordered - oi.qty_received - oi.qty_defect), 0) from public.production_order_items oi join public.production_orders o on o.id = oi.order_id where o.status in ('issued', 'in_progress', 'partial')),
    'overdue',    (select count(*) from public.production_orders where status in ('issued', 'in_progress', 'partial') and due_date < current_date),
    'month_received', (select coalesce(sum((l->>'qty_good')::int), 0) from public.production_receipts r, jsonb_array_elements(r.lines) l where date_trunc('month', r.received_at) = date_trunc('month', current_date)),
    'month_defect',   (select coalesce(sum((l->>'qty_defect')::int), 0) from public.production_receipts r, jsonb_array_elements(r.lines) l where date_trunc('month', r.received_at) = date_trunc('month', current_date)),
    'boms',       (select count(*) from public.boms where is_active),
    'low_materials', (select count(*) from public.materials where is_active and qty <= min_alert and min_alert > 0)
  );
$$;

-- รับวัสดุเข้าพร้อมต้นทุน (ใช้โดยรับของจาก PO) : ต้นทุนเฉลี่ยถ่วงน้ำหนัก
create or replace function public.material_receive_cost(p_material uuid, p_qty numeric, p_unit_cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare m public.materials;
begin
  select * into m from public.materials where id = p_material;
  if m.id is null or p_qty <= 0 then return; end if;
  -- qty ถูกบวกไปแล้วโดย move_material → ยอดก่อนรับ = qty - p_qty
  update public.materials set unit_cost = case when m.qty > 0 then round(((greatest(m.qty - p_qty, 0)) * m.unit_cost + p_qty * coalesce(p_unit_cost, 0)) / m.qty, 2) else coalesce(p_unit_cost, 0) end where id = p_material;
end $$;

-- hook: receive_po records material cost (patch of 0012 function — only the material branch changes)
create or replace function public.receive_po(p_id uuid, p_lines jsonb, p_received_at date default null, p_supplier_doc_no text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs; ln jsonb; it public.purchase_items; v_rc public.receipts; v_prod_items jsonb := '[]'::jsonb; v_total numeric := 0; v_recv numeric := 0; v_qty numeric; v_cond text;
begin
  if not public.can_purchase() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into d from public.purchase_docs where id = p_id and doc_type = 'po';
  if d.id is null then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if d.status not in ('sent', 'partial', 'draft') then raise exception 'สถานะใบสั่งซื้อไม่รองรับการรับของ'; end if;
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce((ln->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    select * into it from public.purchase_items where id = (ln->>'item_id')::uuid and doc_id = p_id;
    if it.id is null then raise exception 'ไม่พบรายการใน PO'; end if;
    v_cond := coalesce(ln->>'condition', 'good');
    if it.product_id is not null then
      v_prod_items := v_prod_items || jsonb_build_object('product_id', it.product_id, 'qty', round(v_qty)::int, 'condition', v_cond, 'unit_cost', it.unit_price, 'note', 'ตาม ' || d.doc_no, 'defect_action', 'review');
    elsif it.material_id is not null then
      perform public.move_material(it.material_id, 'in', v_qty, 'รับตาม ' || d.doc_no || coalesce(' / ' || p_supplier_doc_no, ''), d.supplier_id);
      perform public.material_receive_cost(it.material_id, v_qty, round(it.unit_price * (1 - it.discount_pct / 100), 2));
      update public.material_movements set unit_cost = round(it.unit_price * (1 - it.discount_pct / 100), 2), ref_type = 'purchase', ref_id = d.id
       where id = (select id from public.material_movements where material_id = it.material_id order by created_at desc limit 1);
    end if;
    update public.purchase_items set received_qty = received_qty + v_qty where id = it.id;
  end loop;
  if jsonb_array_length(v_prod_items) > 0 then
    v_rc := public.create_receipt(d.supplier_id, coalesce(p_supplier_doc_no, d.doc_no), coalesce(p_received_at, current_date), 'unpaid', 'รับตามใบสั่งซื้อ ' || d.doc_no || coalesce(' · ' || p_note, ''), v_prod_items);
  end if;
  insert into public.purchase_receipts (doc_id, received_at, stock_receipt_id, lines, note, created_by)
  values (p_id, coalesce(p_received_at, current_date), v_rc.id, p_lines, p_note, public.current_app_user_id());
  select sum(qty), sum(received_qty) into v_total, v_recv from public.purchase_items where doc_id = p_id;
  update public.purchase_docs set status = (case when v_recv >= v_total then 'received' else 'partial' end)::public.purchase_status, updated_at = now() where id = p_id;
  return jsonb_build_object('receipt_no', v_rc.receipt_no, 'receipt_id', v_rc.id, 'status', (select status from public.purchase_docs where id = p_id));
end $$;

-- RLS: all authenticated (SW/admin) read; writes via functions. Cost columns are hidden in the UI for staff.
alter table public.boms enable row level security;
alter table public.bom_items enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_order_items enable row level security;
alter table public.production_issues enable row level security;
alter table public.production_issue_items enable row level security;
alter table public.production_receipts enable row level security;
alter table public.production_counters enable row level security;
create policy "boms read" on public.boms for select to authenticated using (true);
create policy "bom items read" on public.bom_items for select to authenticated using (true);
create policy "mo read" on public.production_orders for select to authenticated using (true);
create policy "mo items read" on public.production_order_items for select to authenticated using (true);
create policy "mi read" on public.production_issues for select to authenticated using (true);
create policy "mi items read" on public.production_issue_items for select to authenticated using (true);
create policy "mr read" on public.production_receipts for select to authenticated using (true);
