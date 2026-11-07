-- =====================================================================
-- PKM ERP — 0007: Sales module (sprint 1)
--   companies (ปากาม้า / ทีฆาซอร์ส) · เอกสารขายครบชุด · ยอดขายออนไลน์รายวัน
-- Run after 0006
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Companies (document issuers)
-- ---------------------------------------------------------------------
create table public.companies (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,           -- PKM / TKS
  name_th        text not null,
  name_en        text,
  branch         text default 'สำนักงานใหญ่',
  address_th     text,
  address_en     text,
  tax_id         text,
  phone          text, mobile text, email text, website text,
  vat_registered boolean not null default true,
  bank_name      text, bank_branch text, bank_account_name text, bank_account_no text,
  signer_name    text,                             -- ชื่อผู้มีอำนาจ (พิมพ์ใต้ลายเซ็น)
  doc_lang       text not null default 'th',      -- th / en
  is_active      boolean not null default true
);

insert into public.companies (code, name_th, name_en, branch, address_th, address_en, tax_id, phone, mobile, email, website, vat_registered, bank_name, bank_branch, bank_account_name, bank_account_no, doc_lang) values
  ('PKM', 'บริษัท ปากาม้า (ไทยแลนด์) จำกัด', 'PAHKAHMAH (THAILAND) CO., LTD.', 'สำนักงานใหญ่',
   '55/118 หมู่ 2 ต.ท่าตลาด อ.สามพราน จ.นครปฐม 73110', '55/118 Moo 2, Thatalad, Sampran, Nakhon Pathom 73110, Thailand',
   '0735559002163', '0894597897', '0642541665', 'pahkahmah@gmail.com', 'www.pahkahmahthailand.com', true,
   'ไทยพาณิชย์', 'สยามสแควร์', 'บริษัท ปากาม้า(ไทยแลนด์) จำกัด', '038-466621-9', 'th'),
  ('TKS', 'บริษัท ทีฆาซอร์ส จำกัด', 'TIKHA SOURCE CO., LTD.', 'สำนักงานใหญ่',
   '1/2 ซอยเพชรเกษม 110 แยก 5 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพฯ 10160', '1/2 Soi Petchkasem 110 Yaek 5, Nong Khang Phlu, Nong Khaem, Bangkok 10160, Thailand',
   null, null, null, null, null, false, null, null, null, null, 'en');

-- ---------------------------------------------------------------------
-- 2. Sales documents
-- ---------------------------------------------------------------------
create type public.sales_doc_type as enum (
  'quotation',      -- QT  ใบเสนอราคา
  'temp_delivery',  -- TD  ใบส่งของชั่วคราว
  'invoice',        -- INV ใบส่งสินค้า/ใบแจ้งหนี้/ใบกำกับภาษี
  'billing',        -- BL  ใบวางบิล/ใบแจ้งหนี้
  'receipt',        -- RE  ใบเสร็จรับเงิน
  'credit_note',    -- CN  ใบลดหนี้
  'debit_note'      -- DN  ใบเพิ่มหนี้
);
create type public.sales_doc_status as enum ('draft', 'issued', 'accepted', 'partial', 'paid', 'cancelled');
create type public.vat_mode as enum ('inclusive', 'exclusive', 'none');
create type public.sales_channel as enum ('store', 'corporate', 'online', 'export', 'intercompany', 'other');

create table public.sales_docs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  doc_type        public.sales_doc_type not null,
  doc_no          text not null,
  doc_date        date not null default (now() at time zone 'Asia/Bangkok')::date,
  due_date        date,
  valid_until     date,
  customer_id     uuid references public.contacts(id),
  customer_name   text not null,                   -- snapshot ตอนออกเอกสาร
  customer_address text,
  customer_tax_id text,
  customer_branch text,
  channel         public.sales_channel not null default 'corporate',
  ref_doc_id      uuid references public.sales_docs(id),   -- เอกสารต้นทาง (QT→INV→RE)
  ref_doc_no      text,                                     -- เลขที่อ้างอิง (รวมเอกสาร FlowAccount)
  po_no           text,                                     -- PO ลูกค้า/ห้าง
  status          public.sales_doc_status not null default 'draft',
  vat_mode        public.vat_mode not null default 'inclusive',
  vat_rate        numeric(5,2) not null default 7,
  discount_pct    numeric(6,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,     -- ส่วนลดท้ายบิล (บาท) ถ้าไม่ใช้ %
  deposit_amount  numeric(14,2) not null default 0,     -- หักเงินมัดจำ (ใบวางบิล)
  deposit_ref     text,
  wht_pct         numeric(5,2) not null default 0,      -- หัก ณ ที่จ่าย (ใบเสร็จ)
  -- computed totals (filled by recalc)
  subtotal        numeric(14,2) not null default 0,     -- รวมเป็นเงิน (ตามราคาที่กรอก)
  discount_total  numeric(14,2) not null default 0,
  net_before_vat  numeric(14,2) not null default 0,
  vat_amount      numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,
  wht_amount      numeric(14,2) not null default 0,
  paid_total      numeric(14,2) not null default 0,
  -- payment (receipt)
  payment_method  text,                                 -- โอน / เงินสด / เช็ค / บัตร
  payment_date    date,
  payment_ref     text,
  -- stock
  deduct_stock    boolean not null default false,
  stock_issue_id  uuid references public.issues(id),
  -- misc
  notes           text,                                 -- หมายเหตุบนเอกสาร
  internal_note   text,
  seller_name     text,                                 -- ผู้ขาย
  source          text not null default 'system',      -- system / flowaccount_pdf
  pdf_url         text,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, doc_no)
);
create index on public.sales_docs (doc_type, doc_date desc);
create index on public.sales_docs (customer_id);
create index on public.sales_docs (status);
create trigger sales_docs_updated before update on public.sales_docs for each row execute function public.set_updated_at();

create table public.sales_doc_items (
  id           uuid primary key default gen_random_uuid(),
  doc_id       uuid not null references public.sales_docs(id) on delete cascade,
  line_no      int not null default 1,
  product_id   uuid references public.products(id),
  description  text not null,
  barcode      text,
  qty          numeric(12,2) not null default 1,
  unit         text default 'ชิ้น',
  unit_price   numeric(14,2) not null default 0,
  discount_pct numeric(6,2) not null default 0,
  amount       numeric(14,2) not null default 0,     -- qty*price*(1-disc)
  note         text
);
create index on public.sales_doc_items (doc_id);

-- receipt → invoices allocation
create table public.sales_payments (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.sales_docs(id) on delete cascade,
  invoice_id  uuid not null references public.sales_docs(id) on delete cascade,
  amount      numeric(14,2) not null,
  unique (receipt_id, invoice_id)
);

create table public.sales_doc_counters (
  company_id uuid not null references public.companies(id),
  prefix     text not null,
  yyyymm     text not null,
  last_no    int not null default 0,
  primary key (company_id, prefix, yyyymm)
);

-- ---------------------------------------------------------------------
-- 3. Online daily sales (7 channels)
-- ---------------------------------------------------------------------
create table public.online_channels (
  key         text primary key,
  name        text not null,
  color       text not null default '#452a79',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  bills_to_tks boolean not null default false     -- ช่องทางนี้ออกใบเสร็จในนามทีฆาซอร์สแล้ว
);
insert into public.online_channels (key, name, color, sort_order) values
  ('pahkahmahstore', 'pahkahmahstore.com', '#452a79', 1),
  ('pahkahmah',      'pahkahmah.com',      '#5f116e', 2),
  ('shopee',         'Shopee',             '#ee4d2d', 3),
  ('lazada',         'Lazada',             '#0f146d', 4),
  ('tiktok',         'TikTok',             '#111111', 5),
  ('nexgen',         'NexGen',             '#06acb4', 6),
  ('thaimart',       'Thaimart',           '#e42213', 7);

create table public.online_sales_daily (
  id            uuid primary key default gen_random_uuid(),
  sale_date     date not null,
  channel       text not null references public.online_channels(key),
  orders_count  int not null default 0,
  gross_amount  numeric(14,2) not null default 0,   -- ยอดขายรวม
  fees          numeric(14,2) not null default 0,   -- ค่าธรรมเนียมแพลตฟอร์ม
  net_amount    numeric(14,2) generated always as (gross_amount - fees) stored,
  recorded_tks  boolean not null default false,     -- บันทึกเข้าทีฆาซอร์สแล้ว
  note          text,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (sale_date, channel)
);
create trigger online_sales_updated before update on public.online_sales_daily for each row execute function public.set_updated_at();

-- item-level online sales (optional, from platform file upload later)
create table public.online_sales_items (
  id          uuid primary key default gen_random_uuid(),
  sale_date   date not null,
  channel     text not null references public.online_channels(key),
  product_id  uuid references public.products(id),
  barcode     text,
  description text,
  qty         numeric(12,2) not null default 1,
  amount      numeric(14,2) not null default 0,
  order_ref   text,
  created_at  timestamptz not null default now()
);
create index on public.online_sales_items (sale_date, channel);

-- ---------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------
create or replace function public.sales_prefix(p_type public.sales_doc_type) returns text
language sql immutable as $$
  select case p_type
    when 'quotation' then 'QT' when 'temp_delivery' then 'TD' when 'invoice' then 'INV'
    when 'billing' then 'BL' when 'receipt' then 'RE' when 'credit_note' then 'CN' when 'debit_note' then 'DN' end;
$$;

-- FlowAccount-style number: QT2026110009  (prefix + YYYY + MM + 4-digit running no. per company/type/month)
create or replace function public.next_sales_doc_no(p_company uuid, p_type public.sales_doc_type, p_date date default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_ym text := to_char(coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date), 'YYYYMM'); v_prefix text := public.sales_prefix(p_type); v_n int;
begin
  insert into public.sales_doc_counters (company_id, prefix, yyyymm, last_no) values (p_company, v_prefix, v_ym, 1)
    on conflict (company_id, prefix, yyyymm) do update set last_no = public.sales_doc_counters.last_no + 1
    returning last_no into v_n;
  return v_prefix || v_ym || to_char(v_n, 'FM0000');
end $$;

-- recompute totals of a document from its items
create or replace function public.recalc_sales_doc(p_doc uuid) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs; v_sub numeric; v_disc numeric; v_after numeric; v_net numeric; v_vat numeric; v_grand numeric; v_wht numeric;
begin
  select * into d from public.sales_docs where id = p_doc;
  update public.sales_doc_items set amount = round(qty * unit_price * (1 - discount_pct / 100), 2) where doc_id = p_doc;
  select coalesce(sum(amount), 0) into v_sub from public.sales_doc_items where doc_id = p_doc;
  v_disc := case when d.discount_pct > 0 then round(v_sub * d.discount_pct / 100, 2) else d.discount_amount end;
  v_after := v_sub - v_disc - coalesce(d.deposit_amount, 0);
  if d.vat_mode = 'inclusive' then
    v_grand := v_after;
    v_net := round(v_after * 100 / (100 + d.vat_rate), 2);
    v_vat := v_grand - v_net;
  elsif d.vat_mode = 'exclusive' then
    v_net := v_after;
    v_vat := round(v_after * d.vat_rate / 100, 2);
    v_grand := v_net + v_vat;
  else
    v_net := v_after; v_vat := 0; v_grand := v_after;
  end if;
  v_wht := round(v_net * coalesce(d.wht_pct, 0) / 100, 2);
  update public.sales_docs
     set subtotal = v_sub, discount_total = v_disc, net_before_vat = v_net, vat_amount = v_vat, grand_total = v_grand, wht_amount = v_wht
   where id = p_doc returning * into d;
  return d;
end $$;

-- create a document with items (jsonb array) — customer snapshot taken from contacts
create or replace function public.create_sales_doc(
  p_company uuid, p_type public.sales_doc_type, p_customer uuid, p_customer_name text, p_customer_address text, p_customer_tax_id text, p_customer_branch text,
  p_doc_date date, p_due_date date, p_valid_until date, p_channel public.sales_channel, p_ref_doc uuid, p_ref_doc_no text, p_po_no text,
  p_vat_mode public.vat_mode, p_discount_pct numeric, p_discount_amount numeric, p_deposit_amount numeric, p_deposit_ref text, p_wht_pct numeric,
  p_notes text, p_internal_note text, p_seller_name text, p_deduct_stock boolean, p_items jsonb, p_doc_no text default null, p_source text default 'system'
) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs; it jsonb; i int := 0; c public.companies;
begin
  select * into c from public.companies where id = p_company;
  if c.id is null then raise exception 'ไม่พบบริษัท'; end if;
  insert into public.sales_docs (company_id, doc_type, doc_no, doc_date, due_date, valid_until, customer_id, customer_name, customer_address, customer_tax_id, customer_branch,
      channel, ref_doc_id, ref_doc_no, po_no, vat_mode, vat_rate, discount_pct, discount_amount, deposit_amount, deposit_ref, wht_pct, notes, internal_note, seller_name, deduct_stock, source, created_by)
  values (p_company, p_type, coalesce(p_doc_no, public.next_sales_doc_no(p_company, p_type, p_doc_date)), coalesce(p_doc_date, (now() at time zone 'Asia/Bangkok')::date), p_due_date, p_valid_until,
      p_customer, p_customer_name, p_customer_address, p_customer_tax_id, p_customer_branch, coalesce(p_channel, 'corporate'), p_ref_doc, p_ref_doc_no, p_po_no,
      case when not c.vat_registered then 'none' else coalesce(p_vat_mode, 'inclusive') end, 7, coalesce(p_discount_pct, 0), coalesce(p_discount_amount, 0),
      coalesce(p_deposit_amount, 0), p_deposit_ref, coalesce(p_wht_pct, 0), p_notes, p_internal_note, p_seller_name, coalesce(p_deduct_stock, false), p_source, public.current_app_user_id())
  returning * into d;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.sales_doc_items (doc_id, line_no, product_id, description, barcode, qty, unit, unit_price, discount_pct, note)
    values (d.id, i, nullif(it->>'product_id', '')::uuid, it->>'description', nullif(it->>'barcode', ''), coalesce((it->>'qty')::numeric, 1), coalesce(nullif(it->>'unit', ''), 'ชิ้น'),
            coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'discount_pct')::numeric, 0), it->>'note');
  end loop;
  return public.recalc_sales_doc(d.id);
end $$;

-- replace items of a draft and recalc
create or replace function public.replace_sales_items(p_doc uuid, p_items jsonb) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare it jsonb; i int := 0; d public.sales_docs;
begin
  select * into d from public.sales_docs where id = p_doc;
  if d.status <> 'draft' then raise exception 'แก้รายการได้เฉพาะเอกสารฉบับร่าง'; end if;
  delete from public.sales_doc_items where doc_id = p_doc;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.sales_doc_items (doc_id, line_no, product_id, description, barcode, qty, unit, unit_price, discount_pct, note)
    values (p_doc, i, nullif(it->>'product_id', '')::uuid, it->>'description', nullif(it->>'barcode', ''), coalesce((it->>'qty')::numeric, 1), coalesce(nullif(it->>'unit', ''), 'ชิ้น'),
            coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'discount_pct')::numeric, 0), it->>'note');
  end loop;
  return public.recalc_sales_doc(p_doc);
end $$;

-- issue a document: locks it; invoice/temp delivery with deduct_stock creates a stock issue
create or replace function public.issue_sales_doc(p_doc uuid) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs; v_items jsonb; v_issue public.issues;
begin
  select * into d from public.sales_docs where id = p_doc;
  if d.id is null then raise exception 'ไม่พบเอกสาร'; end if;
  if d.status <> 'draft' then raise exception 'เอกสารนี้ออกแล้ว'; end if;
  if not exists (select 1 from public.sales_doc_items where doc_id = p_doc) then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  if d.deduct_stock and d.doc_type in ('invoice', 'temp_delivery') and d.stock_issue_id is null then
    select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty::int, 'note', description)) into v_items
      from public.sales_doc_items where doc_id = p_doc and product_id is not null and qty > 0;
    if v_items is not null then
      v_issue := public.create_issue(d.customer_id, d.doc_date, 'sales_doc', d.doc_no, 'ตามเอกสาร ' || d.doc_no, v_items);
      update public.sales_docs set stock_issue_id = v_issue.id where id = p_doc;
    end if;
  end if;

  update public.sales_docs set status = 'issued' where id = p_doc returning * into d;
  -- quotation → mark accepted when a child doc is created (handled in convert)
  return d;
end $$;

-- convert: create the next document in the chain from an existing one (copies items)
create or replace function public.convert_sales_doc(p_from uuid, p_to_type public.sales_doc_type, p_deduct_stock boolean default false)
returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare s public.sales_docs; d public.sales_docs; v_items jsonb;
begin
  select * into s from public.sales_docs where id = p_from;
  if s.id is null then raise exception 'ไม่พบเอกสารต้นทาง'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'description', description, 'barcode', barcode, 'qty', qty, 'unit', unit, 'unit_price', unit_price, 'discount_pct', discount_pct, 'note', note) order by line_no), '[]'::jsonb)
    into v_items from public.sales_doc_items where doc_id = p_from;
  d := public.create_sales_doc(s.company_id, p_to_type, s.customer_id, s.customer_name, s.customer_address, s.customer_tax_id, s.customer_branch,
        null, null, null, s.channel, s.id, s.doc_no, s.po_no, s.vat_mode, s.discount_pct, s.discount_amount,
        case when p_to_type = 'billing' then s.deposit_amount else 0 end, s.deposit_ref, case when p_to_type = 'receipt' then s.wht_pct else 0 end,
        s.notes, null, s.seller_name, p_deduct_stock, v_items);
  if s.doc_type = 'quotation' and s.status = 'issued' then update public.sales_docs set status = 'accepted' where id = s.id; end if;
  -- receipt created from an invoice/billing: pre-allocate full amount
  if p_to_type = 'receipt' and s.doc_type in ('invoice', 'billing', 'temp_delivery') then
    insert into public.sales_payments (receipt_id, invoice_id, amount) values (d.id, s.id, s.grand_total - s.paid_total);
  end if;
  return d;
end $$;

-- record a receipt as paid → updates allocated invoices
create or replace function public.settle_receipt(p_receipt uuid, p_method text, p_date date, p_ref text) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare r public.sales_docs; p record;
begin
  select * into r from public.sales_docs where id = p_receipt and doc_type = 'receipt';
  if r.id is null then raise exception 'ไม่พบใบเสร็จ'; end if;
  if r.status = 'draft' then r := public.issue_sales_doc(p_receipt); end if;
  update public.sales_docs set status = 'paid', payment_method = p_method, payment_date = coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date), payment_ref = p_ref, paid_total = grand_total
   where id = p_receipt returning * into r;
  for p in select * from public.sales_payments where receipt_id = p_receipt loop
    update public.sales_docs d set paid_total = d.paid_total + p.amount,
      status = case when d.paid_total + p.amount >= d.grand_total - 0.01 then 'paid'::public.sales_doc_status else 'partial'::public.sales_doc_status end
     where d.id = p.invoice_id;
  end loop;
  return r;
end $$;

create or replace function public.cancel_sales_doc(p_doc uuid, p_reason text default null) returns public.sales_docs
language plpgsql security definer set search_path = public as $$
declare d public.sales_docs;
begin
  update public.sales_docs set status = 'cancelled', internal_note = coalesce(internal_note || E'\n', '') || 'ยกเลิก: ' || coalesce(p_reason, '-') where id = p_doc returning * into d;
  return d;
end $$;

-- sales summary for dashboard
create or replace function public.sales_summary(p_from date, p_to date)
returns table (channel public.sales_channel, company_code text, docs int, net numeric, vat numeric, total numeric)
language sql stable security definer set search_path = public as $$
  select d.channel, c.code, count(*)::int, sum(d.net_before_vat), sum(d.vat_amount), sum(d.grand_total)
    from public.sales_docs d join public.companies c on c.id = d.company_id
   where d.doc_type in ('invoice', 'temp_delivery') and d.status not in ('draft', 'cancelled') and d.doc_date between p_from and p_to
   group by d.channel, c.code;
$$;

-- outstanding receivables
create or replace view public.sales_receivables as
  select d.*, c.code as company_code, (d.grand_total - d.paid_total) as outstanding,
         case when d.due_date is not null and d.due_date < (now() at time zone 'Asia/Bangkok')::date then true else false end as overdue
    from public.sales_docs d join public.companies c on c.id = d.company_id
   where d.doc_type in ('invoice', 'billing') and d.status in ('issued', 'partial');

-- ---------------------------------------------------------------------
-- 5. RLS — ทีม SW + admin
-- ---------------------------------------------------------------------
create or replace function public.can_sell() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.employees e join public.teams t on t.id = e.team_id
     where e.id = public.my_employee_id() and t.abbrev = 'SW');
$$;

alter table public.companies           enable row level security;
alter table public.sales_docs          enable row level security;
alter table public.sales_doc_items     enable row level security;
alter table public.sales_payments      enable row level security;
alter table public.sales_doc_counters  enable row level security;
alter table public.online_channels     enable row level security;
alter table public.online_sales_daily  enable row level security;
alter table public.online_sales_items  enable row level security;

create policy "companies read"  on public.companies for select to authenticated using (true);
create policy "companies admin" on public.companies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "channels read"   on public.online_channels for select to authenticated using (true);
create policy "channels admin"  on public.online_channels for all to authenticated using (public.is_admin()) with check (public.is_admin());
do $$ declare t text; begin
  foreach t in array array['sales_docs','sales_doc_items','sales_payments','online_sales_daily','online_sales_items'] loop
    execute format('create policy "%s sw" on public.%I for all to authenticated using (public.can_sell()) with check (public.can_sell())', t, t);
  end loop;
end $$;
create policy "counters admin" on public.sales_doc_counters for all to authenticated using (public.is_admin()) with check (public.is_admin());
