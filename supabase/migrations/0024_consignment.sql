-- =====================================================================
-- PKM ERP — 0024: คลังฝากขาย (Consignment) แยกต่อห้าง
--   ใบส่งของชั่วคราว (TD) ของห้างฝากขาย  = โอนของ คลังหลัก → คลังห้าง (ไม่ใช่การขาย)
--   ใบส่งสินค้า/ใบกำกับ (INV) ของห้างฝากขาย = ตัดจากคลังห้าง ตาม SKU ที่ขายได้จริง (ไม่แตะคลังหลัก)
--   รับคืน = คลังห้าง → คลังหลัก · กระทบยอดกับรายงานคงเหลือจากห้าง = ปรับคลังห้าง
--   ห้างอื่น (ซื้อขาด) ทำเหมือนเดิมทุกอย่าง
-- =====================================================================

alter type public.movement_type add value if not exists 'consign_out';      -- คลังหลัก → คลังห้าง
alter type public.movement_type add value if not exists 'consign_return';   -- คลังห้าง → คลังหลัก

create table public.consign_locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_ids  uuid[] not null default '{}',          -- ลูกค้าในสมุดรายชื่อที่นับเป็นห้างนี้ (หลายสาขาได้)
  color        text not null default '#452a79',
  note         text,
  is_active    boolean not null default true,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now()
);

create table public.consign_stock (
  location_id  uuid not null references public.consign_locations(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  qty          int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (location_id, product_id)
);

create table public.consign_movements (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.consign_locations(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  kind          text not null check (kind in ('in', 'sale', 'return', 'adjust', 'reverse')),
  qty           int not null,                 -- + เข้าคลังห้าง / − ออกจากคลังห้าง
  balance_after int not null,
  ref_type      text,                         -- sales_doc / return / reconcile
  ref_id        uuid,
  ref_no        text,
  note          text,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now()
);
create index on public.consign_movements (location_id, created_at desc);
create index on public.consign_movements (ref_type, ref_id);

alter table public.sales_docs add column if not exists consign_location_id uuid references public.consign_locations(id);
alter table public.sales_docs add column if not exists consign_skip boolean not null default false;   -- เลือก "ไม่ใช่ฝากขาย" แม้ลูกค้าเป็นห้างฝากขาย

-- ---------------------------------------------------------------------
-- core: move qty in a consignment location (balance may go negative → shows up in reconcile)
create or replace function public.consign_apply(p_loc uuid, p_product uuid, p_qty int, p_kind text, p_ref_type text, p_ref_id uuid, p_ref_no text, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare v_bal int;
begin
  insert into public.consign_stock (location_id, product_id, qty) values (p_loc, p_product, p_qty)
  on conflict (location_id, product_id) do update set qty = public.consign_stock.qty + excluded.qty, updated_at = now()
  returning qty into v_bal;
  insert into public.consign_movements (location_id, product_id, kind, qty, balance_after, ref_type, ref_id, ref_no, note, created_by)
  values (p_loc, p_product, p_kind, p_qty, v_bal, p_ref_type, p_ref_id, p_ref_no, p_note, public.current_app_user_id());
  return v_bal;
end $$;

-- which consignment location a customer belongs to
create or replace function public.consign_location_of(p_contact uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.consign_locations where is_active and p_contact = any(contact_ids) order by sort_order limit 1;
$$;

-- ---------------------------------------------------------------------
-- issue_sales_doc: ห้างฝากขาย → โอน/ตัดคลังห้าง แทนคลังหลัก
create or replace function public.issue_sales_doc(p_doc uuid) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs; v_items jsonb; v_issue public.issues; v_loc uuid; it record;
begin
  select * into d from public.sales_docs where id = p_doc;
  if d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if d.status <> 'draft' then raise exception 'เอกสารนี้ออกแล้ว'; end if;
  if not exists (select 1 from public.sales_doc_items where doc_id = p_doc) then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  -- ห้างฝากขาย: ใช้ที่เลือกไว้ในเอกสาร หรือหาจากลูกค้า
  v_loc := d.consign_location_id;
  if v_loc is null and not d.consign_skip and d.doc_type in ('invoice', 'temp_delivery') and d.customer_id is not null then
    v_loc := public.consign_location_of(d.customer_id);
    if v_loc is not null then update public.sales_docs set consign_location_id = v_loc where id = p_doc; end if;
  end if;

  if v_loc is not null and d.doc_type = 'temp_delivery' then
    -- โอนเข้าคลังห้าง: คลังหลัก − / คลังห้าง +
    for it in select product_id, sum(qty)::int q from public.sales_doc_items where doc_id = p_doc and product_id is not null and qty > 0 group by product_id loop
      perform public.apply_movement(it.product_id, 'consign_out', -it.q, 0, 'sales_docs', p_doc, d.doc_no, 'ฝากขาย → ' || (select name from public.consign_locations where id = v_loc));
      perform public.consign_apply(v_loc, it.product_id, it.q, 'in', 'sales_doc', p_doc, d.doc_no, 'ใบส่งของชั่วคราว');
    end loop;
  elsif v_loc is not null and d.doc_type = 'invoice' then
    -- ขายได้จริงตามรายงานห้าง: ตัดจากคลังห้าง (ไม่แตะคลังหลัก)
    for it in select product_id, sum(qty)::int q from public.sales_doc_items where doc_id = p_doc and product_id is not null and qty > 0 group by product_id loop
      perform public.consign_apply(v_loc, it.product_id, -it.q, 'sale', 'sales_doc', p_doc, d.doc_no, 'ขายได้ (ใบกำกับ)');
    end loop;
  elsif d.deduct_stock and d.doc_type in ('invoice', 'temp_delivery') and d.stock_issue_id is null then
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty::int, 'note', description)) into v_items
      from public.sales_doc_items where doc_id = p_doc and product_id is not null and qty > 0;
    if v_items is not null then
      v_issue := public.create_issue(d.customer_id, d.doc_date, 'sales_doc', d.doc_no, 'ตามเอกสาร ' || d.doc_no, v_items);
      update public.sales_docs set stock_issue_id = v_issue.id where id = p_doc;
    end if;
  end if;

  update public.sales_docs set status = 'issued' where id = p_doc returning * into d;
  return d;
end $$;

-- ยกเลิกเอกสาร: ถ้าเป็นเอกสารฝากขาย คืนยอดคลังห้าง/คลังหลักให้อัตโนมัติ
create or replace function public.cancel_sales_doc(p_doc uuid, p_reason text default null) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs; m record;
begin
  select * into d from public.sales_docs where id = p_doc;
  if d.status <> 'cancelled' then
    for m in select * from public.consign_movements where ref_type = 'sales_doc' and ref_id = p_doc and kind in ('in', 'sale') loop
      perform public.consign_apply(m.location_id, m.product_id, -m.qty, 'reverse', 'sales_doc', p_doc, d.doc_no, 'ยกเลิกเอกสาร');
      if m.kind = 'in' then perform public.apply_movement(m.product_id, 'consign_return', m.qty, 0, 'sales_docs', p_doc, d.doc_no, 'ยกเลิกใบส่งของชั่วคราว'); end if;
    end loop;
  end if;
  update public.sales_docs set status = 'cancelled', internal_note = coalesce(internal_note || E'\n', '') || 'ยกเลิก: ' || coalesce(p_reason, '-') where id = p_doc returning * into d;
  return d;
end $$;

-- รับคืนจากห้าง → คลังหลัก  items = [{product_id, qty}]
create or replace function public.consign_return(p_loc uuid, p_date date, p_ref text, p_note text, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_n int := 0; v_ref text;
begin
  if not public.can_sell() then raise exception 'ไม่มีสิทธิ์'; end if;
  v_ref := coalesce(nullif(p_ref, ''), 'RT' || to_char(coalesce(p_date, current_date), 'YYYYMMDD'));
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'qty')::int, 0) <= 0 then continue; end if;
    if (it->>'qty')::int > coalesce((select qty from public.consign_stock where location_id = p_loc and product_id = (it->>'product_id')::uuid), 0) then
      raise exception 'รับคืนเกินยอดที่อยู่ห้าง (%)', (select code from public.products where id = (it->>'product_id')::uuid); end if;
    perform public.consign_apply(p_loc, (it->>'product_id')::uuid, -((it->>'qty')::int), 'return', 'return', null, v_ref, p_note);
    perform public.apply_movement((it->>'product_id')::uuid, 'consign_return', (it->>'qty')::int, 0, 'consign_locations', p_loc, v_ref,
                                  'รับคืนจาก ' || (select name from public.consign_locations where id = p_loc) || coalesce(' — ' || p_note, ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- กระทบยอด: ตั้งยอดคลังห้างให้ตรงกับรายงานคงเหลือจากห้าง  items = [{product_id, qty}] (qty = ยอดตามห้าง)
create or replace function public.consign_reconcile(p_loc uuid, p_ref text, p_note text, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_cur int; v_n int := 0;
begin
  if not public.can_sell() then raise exception 'ไม่มีสิทธิ์'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select coalesce((select qty from public.consign_stock where location_id = p_loc and product_id = (it->>'product_id')::uuid), 0) into v_cur;
    if (it->>'qty')::int <> v_cur then
      perform public.consign_apply(p_loc, (it->>'product_id')::uuid, (it->>'qty')::int - v_cur, 'adjust', 'reconcile', null, p_ref, coalesce(p_note, 'กระทบยอดตามรายงานห้าง'));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.save_consign_location(p_id uuid, p_name text, p_contacts uuid[], p_color text, p_note text, p_active boolean)
returns public.consign_locations language plpgsql security definer set search_path = public as $$
declare l public.consign_locations;
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้บริหาร'; end if;
  if p_id is null then
    insert into public.consign_locations (name, contact_ids, color, note, is_active) values (p_name, coalesce(p_contacts, '{}'), coalesce(p_color, '#452a79'), p_note, coalesce(p_active, true)) returning * into l;
  else
    update public.consign_locations set name = p_name, contact_ids = coalesce(p_contacts, '{}'), color = coalesce(p_color, color), note = p_note, is_active = coalesce(p_active, is_active) where id = p_id returning * into l;
  end if;
  return l;
end $$;

alter table public.consign_locations enable row level security;
alter table public.consign_stock enable row level security;
alter table public.consign_movements enable row level security;
create policy "consign loc read"  on public.consign_locations for select to authenticated using (true);
create policy "consign stock read" on public.consign_stock for select to authenticated using (true);
create policy "consign mv read"   on public.consign_movements for select to authenticated using (true);

-- seed: ห้างฝากขาย 3 แห่ง (ผูกลูกค้าในสมุดรายชื่อที่ชื่อตรง — แก้/เพิ่มได้ที่หน้าคลังฝากขาย)
insert into public.consign_locations (name, contact_ids, color, sort_order) values
  ('สารพัดไทย',        coalesce((select array_agg(id) from public.contacts where kind = 'customer' and (name ilike '%สารพัดไทย%' or name ilike '%sarapad%')), '{}'), '#8a5a00', 10),
  ('Big C บิ๊กซี',      coalesce((select array_agg(id) from public.contacts where kind = 'customer' and (name ilike '%big c%' or name ilike '%bigc%' or name ilike '%บิ๊กซี%' or name ilike '%บิ๊ก ซี%')), '{}'), '#e42213', 20),
  ('หัวหินช้อปปิ้ง',    coalesce((select array_agg(id) from public.contacts where kind = 'customer' and name ilike '%หัวหิน%'), '{}'), '#06acb4', 30);
