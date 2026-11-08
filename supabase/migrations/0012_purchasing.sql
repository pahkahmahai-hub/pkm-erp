-- =====================================================================
-- PKM ERP — 0012: โมดูลจัดซื้อ
--   • ใบขอซื้อภายใน (PR) → ผู้บริหารอนุมัติ → แปลงเป็นใบสั่งซื้อ (PO) → ส่งซัพพลายเออร์
--   • admin เปิด PO ตรงได้ · รายการ = สินค้า / ลายผ้า-แพคเกจจิ้ง / พิมพ์อิสระ (+บรรทัดย่อย เช่น สี/ลาย)
--   • รับของจาก PO → รับเข้าคลังใหญ่ (ใบรับเข้า RC) + วัสดุ (material_movements) ตามจำนวนรับจริง, รับบางส่วนได้
--   • สร้างบิลค่าใช้จ่าย (รออนุมัติ) จาก PO ได้ในคลิกเดียว
--   • เลขที่: PR + YYYYMM + 4 หลัก, PO + YYYYMM + 4 หลัก (แบบ FlowAccount) ต่อบริษัท
--   • สิทธิ์: admin + ทีม SW เปิด PR/PO ได้ · พนักงานเห็นเฉพาะใบที่ตัวเองสร้าง · อนุมัติเฉพาะ admin
-- =====================================================================

create type public.purchase_doc_type as enum ('pr', 'po');
create type public.purchase_status as enum ('draft', 'pending', 'approved', 'rejected', 'ordered', 'sent', 'partial', 'received', 'closed', 'cancelled');

create table public.purchase_docs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  doc_type        public.purchase_doc_type not null,
  doc_no          text not null,
  doc_date        date not null default (now() at time zone 'Asia/Bangkok')::date,
  need_by         date,                                  -- วันที่ต้องการของ / ครบกำหนดส่ง
  supplier_id     uuid references public.contacts(id),
  supplier_name   text,
  supplier_tax_id text,
  supplier_address text,
  supplier_branch text,
  purpose         text,                                  -- เหตุผล/ใช้ทำอะไร (PR)
  notes           text,                                  -- พิมพ์บนเอกสาร
  internal_note   text,
  vat_mode        public.vat_mode not null default 'exclusive',
  vat_rate        numeric(5,2) not null default 7,
  discount_pct    numeric(6,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  subtotal        numeric(14,2) not null default 0,
  net_before_vat  numeric(14,2) not null default 0,
  vat_amount      numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,
  status          public.purchase_status not null default 'draft',
  ref_doc_id      uuid references public.purchase_docs(id),   -- PO → PR ต้นทาง
  ref_doc_no      text,
  approved_by     uuid references public.app_users(id),
  approved_at     timestamptz,
  review_note     text,
  expense_id      uuid references public.expenses(id),        -- บิลค่าใช้จ่ายที่สร้างจาก PO
  buyer_name      text,                                  -- ผู้สั่งซื้อ (พิมพ์บน PO)
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, doc_no)
);
create index on public.purchase_docs (company_id, doc_type, doc_date desc);
create index on public.purchase_docs (status);
create index on public.purchase_docs (supplier_id);

create table public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  doc_id        uuid not null references public.purchase_docs(id) on delete cascade,
  line_no       int not null default 1,
  product_id    uuid references public.products(id),
  material_id   uuid references public.materials(id),
  description   text not null,
  detail        text,                                    -- บรรทัดย่อย เช่น "- เขียวแดง : 40\n- ขาวกรม : 26"
  qty           numeric(12,2) not null default 1,
  unit          text not null default 'ชิ้น',
  unit_price    numeric(14,2) not null default 0,
  discount_pct  numeric(6,2) not null default 0,
  amount        numeric(14,2) not null default 0,
  received_qty  numeric(12,2) not null default 0
);
create index on public.purchase_items (doc_id);

create table public.purchase_receipts (                 -- ประวัติการรับของต่อ PO
  id            uuid primary key default gen_random_uuid(),
  doc_id        uuid not null references public.purchase_docs(id) on delete cascade,
  received_at   date not null default (now() at time zone 'Asia/Bangkok')::date,
  stock_receipt_id uuid references public.receipts(id),
  lines         jsonb not null,                          -- [{item_id, qty, condition}]
  note          text,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now()
);

create table public.purchase_counters (
  company_id uuid not null references public.companies(id),
  prefix     text not null,
  yyyymm     text not null,
  last_no    int not null default 0,
  primary key (company_id, prefix, yyyymm)
);

-- ---------------------------------------------------------------------
create or replace function public.can_purchase() returns boolean
language sql stable security definer set search_path = public as $$ select public.can_sell(); $$;

create or replace function public.next_purchase_no(p_company uuid, p_type public.purchase_doc_type, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_prefix text := case p_type when 'pr' then 'PR' else 'PO' end; v_ym text := to_char(coalesce(p_date, current_date), 'YYYYMM'); v_n int;
begin
  insert into public.purchase_counters (company_id, prefix, yyyymm, last_no) values (p_company, v_prefix, v_ym, 1)
  on conflict (company_id, prefix, yyyymm) do update set last_no = public.purchase_counters.last_no + 1 returning last_no into v_n;
  return v_prefix || v_ym || to_char(v_n, 'FM0000');
end $$;

create or replace function public.recalc_purchase_doc(p_id uuid) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs; v_sub numeric; v_after numeric; v_net numeric; v_vat numeric; v_grand numeric;
begin
  select * into d from public.purchase_docs where id = p_id;
  update public.purchase_items set amount = round(qty * unit_price * (1 - discount_pct / 100), 2) where doc_id = p_id;
  select coalesce(sum(amount), 0) into v_sub from public.purchase_items where doc_id = p_id;
  v_after := v_sub - coalesce(d.discount_amount, 0) - round(v_sub * coalesce(d.discount_pct, 0) / 100, 2);
  if d.vat_mode = 'inclusive' then v_grand := v_after; v_net := round(v_after * 100 / (100 + d.vat_rate), 2); v_vat := v_grand - v_net;
  elsif d.vat_mode = 'exclusive' then v_net := v_after; v_vat := round(v_after * d.vat_rate / 100, 2); v_grand := v_net + v_vat;
  else v_net := v_after; v_vat := 0; v_grand := v_after; end if;
  update public.purchase_docs set subtotal = v_sub, net_before_vat = v_net, vat_amount = v_vat, grand_total = v_grand, updated_at = now() where id = p_id returning * into d;
  return d;
end $$;

create or replace function public.purchase_write_items(p_doc uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; i int := 0;
begin
  delete from public.purchase_items where doc_id = p_doc;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.purchase_items (doc_id, line_no, product_id, material_id, description, detail, qty, unit, unit_price, discount_pct, received_qty)
    values (p_doc, i, nullif(it->>'product_id', '')::uuid, nullif(it->>'material_id', '')::uuid, coalesce(it->>'description', ''), nullif(it->>'detail', ''),
            coalesce((it->>'qty')::numeric, 1), coalesce(nullif(it->>'unit', ''), 'ชิ้น'), coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'discount_pct')::numeric, 0),
            coalesce((it->>'received_qty')::numeric, 0));
  end loop;
end $$;

-- create PR or PO
create or replace function public.create_purchase_doc(
  p_company uuid, p_type public.purchase_doc_type, p_supplier uuid, p_supplier_name text, p_supplier_tax_id text, p_supplier_address text, p_supplier_branch text,
  p_doc_date date, p_need_by date, p_purpose text, p_notes text, p_internal_note text, p_vat_mode public.vat_mode, p_discount_pct numeric, p_discount_amount numeric,
  p_buyer_name text, p_items jsonb, p_submit boolean default true
) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs; v_status public.purchase_status;
begin
  if not public.can_purchase() then raise exception 'ไม่มีสิทธิ์เปิดเอกสารจัดซื้อ'; end if;
  if p_type = 'po' and not public.is_admin() then
    -- SW staff may draft a PO only from an approved PR (see convert_pr_to_po); direct PO is for admins
    raise exception 'พนักงานเปิดใบสั่งซื้อตรงไม่ได้ — กรุณาเปิดใบขอซื้อ (PR) ให้ผู้บริหารอนุมัติก่อน';
  end if;
  v_status := (case when p_type = 'pr' then (case when coalesce(p_submit, true) then 'pending' else 'draft' end) else 'draft' end)::public.purchase_status;
  insert into public.purchase_docs (company_id, doc_type, doc_no, doc_date, need_by, supplier_id, supplier_name, supplier_tax_id, supplier_address, supplier_branch, purpose, notes, internal_note,
      vat_mode, discount_pct, discount_amount, status, buyer_name, created_by)
  values (p_company, p_type, public.next_purchase_no(p_company, p_type, coalesce(p_doc_date, current_date)), coalesce(p_doc_date, current_date), p_need_by, p_supplier, p_supplier_name, p_supplier_tax_id,
      p_supplier_address, p_supplier_branch, p_purpose, p_notes, p_internal_note, coalesce(p_vat_mode, 'exclusive'), coalesce(p_discount_pct, 0), coalesce(p_discount_amount, 0), v_status, p_buyer_name, public.current_app_user_id())
  returning * into d;
  perform public.purchase_write_items(d.id, p_items);
  return public.recalc_purchase_doc(d.id);
end $$;

create or replace function public.update_purchase_doc(
  p_id uuid, p_supplier uuid, p_supplier_name text, p_supplier_tax_id text, p_supplier_address text, p_supplier_branch text,
  p_doc_date date, p_need_by date, p_purpose text, p_notes text, p_internal_note text, p_vat_mode public.vat_mode, p_discount_pct numeric, p_discount_amount numeric,
  p_buyer_name text, p_items jsonb
) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs;
begin
  select * into d from public.purchase_docs where id = p_id;
  if d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if not (public.is_admin() or d.created_by = public.current_app_user_id()) then raise exception 'แก้ได้เฉพาะผู้สร้างหรือผู้บริหาร'; end if;
  if d.status not in ('draft', 'pending', 'rejected') then raise exception 'แก้ไขได้เฉพาะเอกสารที่ยังไม่อนุมัติ/ยังไม่ส่ง'; end if;
  update public.purchase_docs set supplier_id = p_supplier, supplier_name = p_supplier_name, supplier_tax_id = p_supplier_tax_id, supplier_address = p_supplier_address, supplier_branch = p_supplier_branch,
      doc_date = coalesce(p_doc_date, doc_date), need_by = p_need_by, purpose = p_purpose, notes = p_notes, internal_note = p_internal_note, vat_mode = coalesce(p_vat_mode, vat_mode),
      discount_pct = coalesce(p_discount_pct, 0), discount_amount = coalesce(p_discount_amount, 0), buyer_name = p_buyer_name,
      status = case when status = 'rejected' then 'pending'::public.purchase_status else status end, review_note = case when status = 'rejected' then null else review_note end
  where id = p_id;
  perform public.purchase_write_items(p_id, p_items);
  return public.recalc_purchase_doc(p_id);
end $$;

-- PR: submit / approve / reject (admins)
create or replace function public.submit_purchase_request(p_id uuid) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs;
begin
  update public.purchase_docs set status = 'pending', updated_at = now() where id = p_id and doc_type = 'pr' and status = 'draft'
    and (public.is_admin() or created_by = public.current_app_user_id()) returning * into d;
  if d.id is null then raise exception 'ส่งขออนุมัติไม่ได้'; end if;
  return d;
end $$;

create or replace function public.review_purchase_request(p_id uuid, p_decision text, p_note text default null) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs;
begin
  if not public.is_admin() then raise exception 'อนุมัติใบขอซื้อได้เฉพาะผู้บริหาร'; end if;
  select * into d from public.purchase_docs where id = p_id and doc_type = 'pr';
  if d.id is null then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if d.status not in ('pending', 'draft') then raise exception 'ใบนี้ถูกพิจารณาแล้ว'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'decision ไม่ถูกต้อง'; end if;
  update public.purchase_docs set status = p_decision::public.purchase_status, approved_by = public.current_app_user_id(), approved_at = now(), review_note = p_note, updated_at = now()
   where id = p_id returning * into d;
  return d;
end $$;

-- approved PR → PO (draft) ; PR becomes 'ordered'
create or replace function public.convert_pr_to_po(p_pr uuid, p_doc_date date default null) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare pr public.purchase_docs; po public.purchase_docs;
begin
  if not public.can_purchase() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into pr from public.purchase_docs where id = p_pr and doc_type = 'pr';
  if pr.id is null then raise exception 'ไม่พบใบขอซื้อ'; end if;
  if pr.status <> 'approved' then raise exception 'ใบขอซื้อต้องได้รับอนุมัติก่อนจึงเปิด PO ได้'; end if;
  insert into public.purchase_docs (company_id, doc_type, doc_no, doc_date, need_by, supplier_id, supplier_name, supplier_tax_id, supplier_address, supplier_branch, purpose, notes, internal_note,
      vat_mode, discount_pct, discount_amount, status, ref_doc_id, ref_doc_no, buyer_name, created_by)
  values (pr.company_id, 'po', public.next_purchase_no(pr.company_id, 'po', coalesce(p_doc_date, current_date)), coalesce(p_doc_date, current_date), pr.need_by, pr.supplier_id, pr.supplier_name, pr.supplier_tax_id,
      pr.supplier_address, pr.supplier_branch, pr.purpose, pr.notes, pr.internal_note, pr.vat_mode, pr.discount_pct, pr.discount_amount, 'draft', pr.id, pr.doc_no,
      coalesce(pr.buyer_name, (select coalesce(e.first_name || ' ' || e.last_name, u.email) from public.app_users u left join public.employees e on e.id = u.employee_id where u.id = public.current_app_user_id())),
      public.current_app_user_id())
  returning * into po;
  insert into public.purchase_items (doc_id, line_no, product_id, material_id, description, detail, qty, unit, unit_price, discount_pct)
    select po.id, line_no, product_id, material_id, description, detail, qty, unit, unit_price, discount_pct from public.purchase_items where doc_id = pr.id order by line_no;
  update public.purchase_docs set status = 'ordered', updated_at = now() where id = pr.id;
  return public.recalc_purchase_doc(po.id);
end $$;

-- PO: mark as sent to supplier (locks editing)
create or replace function public.issue_po(p_id uuid) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs;
begin
  select * into d from public.purchase_docs where id = p_id and doc_type = 'po';
  if d.id is null then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if not (public.is_admin() or d.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  if d.status <> 'draft' then raise exception 'ใบสั่งซื้อนี้ส่งแล้ว'; end if;
  if not exists (select 1 from public.purchase_items where doc_id = p_id) then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;
  update public.purchase_docs set status = 'sent', updated_at = now() where id = p_id returning * into d;
  return d;
end $$;

-- receive goods against a PO: products → stock receipt (RC), materials → material movements; partial allowed
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

-- create the supplier bill (expense, pending approval) from a PO
create or replace function public.expense_from_po(p_id uuid, p_bill_no text default null, p_bill_date date default null, p_category uuid default null, p_wht_pct numeric default 0) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs; e public.expenses; v_items jsonb; v_is_company boolean;
begin
  select * into d from public.purchase_docs where id = p_id and doc_type = 'po';
  if d.id is null then raise exception 'ไม่พบใบสั่งซื้อ'; end if;
  if d.expense_id is not null then raise exception 'ใบสั่งซื้อนี้สร้างบิลค่าใช้จ่ายแล้ว'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', description || coalesce(E'\n' || detail, ''), 'qty', qty, 'unit', unit, 'unit_price', round(unit_price * (1 - discount_pct / 100), 2),
                                               'product_id', product_id, 'material_id', material_id) order by line_no), '[]'::jsonb) into v_items from public.purchase_items where doc_id = p_id;
  v_is_company := d.supplier_name ~* 'บริษัท|บจก|หจก|จำกัด|co\.|ltd';
  e := public.create_expense(d.company_id, d.supplier_id, coalesce(d.supplier_name, '—'), d.supplier_tax_id, d.supplier_address, d.supplier_branch, v_is_company,
         p_category, coalesce(p_bill_no, d.doc_no), coalesce(p_bill_date, current_date), null, 'ตามใบสั่งซื้อ ' || d.doc_no || coalesce(' — ' || d.purpose, ''),
         d.vat_mode, d.discount_amount + round(d.subtotal * d.discount_pct / 100, 2), coalesce(p_wht_pct, 0), null, 'สร้างจาก ' || d.doc_no, v_items, '[]'::jsonb, null, true);
  update public.purchase_docs set expense_id = e.id, updated_at = now() where id = p_id;
  return e;
end $$;

create or replace function public.cancel_purchase_doc(p_id uuid, p_reason text default null) returns public.purchase_docs
language plpgsql security definer set search_path = public as $$
declare d public.purchase_docs;
begin
  select * into d from public.purchase_docs where id = p_id;
  if d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if not (public.is_admin() or d.created_by = public.current_app_user_id()) then raise exception 'ไม่มีสิทธิ์'; end if;
  if d.status in ('partial', 'received') and not public.is_admin() then raise exception 'ยกเลิก PO ที่รับของแล้วได้เฉพาะผู้บริหาร'; end if;
  update public.purchase_docs set status = 'cancelled', review_note = coalesce(p_reason, review_note), updated_at = now() where id = p_id returning * into d;
  if d.doc_type = 'po' and d.ref_doc_id is not null then update public.purchase_docs set status = 'approved' where id = d.ref_doc_id and status = 'ordered'; end if;
  return d;
end $$;

create or replace function public.purchase_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pr_pending',  (select count(*) from public.purchase_docs where doc_type = 'pr' and status = 'pending'),
    'pr_approved', (select count(*) from public.purchase_docs where doc_type = 'pr' and status = 'approved'),
    'po_open',     (select count(*) from public.purchase_docs where doc_type = 'po' and status in ('draft', 'sent', 'partial')),
    'po_open_amount', (select coalesce(sum(grand_total), 0) from public.purchase_docs where doc_type = 'po' and status in ('sent', 'partial')),
    'po_month',    (select coalesce(sum(grand_total), 0) from public.purchase_docs where doc_type = 'po' and status not in ('draft', 'cancelled') and date_trunc('month', doc_date) = date_trunc('month', current_date)),
    'awaiting_goods', (select count(*) from public.purchase_docs where doc_type = 'po' and status in ('sent', 'partial') and need_by < current_date)
  );
$$;

-- RLS: staff see their own docs, admins everything
alter table public.purchase_docs enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_counters enable row level security;
-- a requester also sees the PO made from their PR
create or replace function public.can_view_purchase(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.purchase_docs d left join public.purchase_docs r on r.id = d.ref_doc_id
     where d.id = p_doc and (d.created_by = public.current_app_user_id() or r.created_by = public.current_app_user_id()));
$$;
create policy "purchase read" on public.purchase_docs for select to authenticated using (public.can_view_purchase(id));
create policy "purchase items read" on public.purchase_items for select to authenticated using (public.can_view_purchase(doc_id));
create policy "purchase receipts read" on public.purchase_receipts for select to authenticated using (public.can_view_purchase(doc_id));
