-- =====================================================================
-- PKM ERP — 0011: ใบเบิกซื้อระหว่างบริษัท (TKS → PKM) + ยอดขายออนไลน์รายสินค้า
--   • เอกสารใหม่ "ใบเบิกซื้อสินค้า" (PR) ออกในนามทีฆาซอร์ส รวมยอดขายทั้งเดือนเป็นรายสินค้า ราคาส่ง = ราคาขาย ลด 40%
--   • เลขที่เอกสารของ TKS แบบ RC6910-0001 (PREFIX + ปี พ.ศ. 2 หลัก + เดือน + '-' + ลำดับ) · PKM คงแบบ FlowAccount
--   • ยอดขายออนไลน์บันทึกเป็นรายการสินค้า (online_sales_items) และยอดรวมรายวันคำนวณจากรายการ
--   • ปุ่มออกใบกำกับ PKM จากใบเบิกซื้อ (ตัดสต็อกคลังใหญ่)
-- =====================================================================

alter type public.sales_doc_type add value if not exists 'purchase_req';

alter table public.companies add column if not exists doc_no_style text not null default 'flowaccount';  -- flowaccount | tks
alter table public.companies add column if not exists intercompany_discount_pct numeric(5,2) not null default 40;
alter table public.companies add column if not exists logo_path text;
update public.companies set doc_no_style = 'tks', tax_id = coalesce(nullif(tax_id, ''), '0105569018602'), logo_path = '/brand/tks-mark.png',
       website = coalesce(website, 'www.pahkahmahstore.com') where code = 'TKS';
update public.companies set website = 'www.pahkahmahstore.com' where code = 'PKM' and (website is null or website = 'www.pahkahmahthailand.com');

-- แพลตฟอร์มที่ออกบิลในนามทีฆาซอร์ส (ตอนนี้: NexGen, Thaimart) — สลับทีหลังได้ในหน้า ยอดขายออนไลน์
update public.online_channels set bills_to_tks = (key in ('nexgen', 'thaimart'));

-- items: who/when + unit price
alter table public.online_sales_items add column if not exists unit_price numeric(14,2) not null default 0;
alter table public.online_sales_items add column if not exists created_by uuid references public.app_users(id);
create index if not exists online_sales_items_month on public.online_sales_items (channel, sale_date);

-- ---------------------------------------------------------------------
-- Prefix per style (text compare so the new enum value is safe in the same script)
-- ---------------------------------------------------------------------
create or replace function public.sales_prefix(p_type public.sales_doc_type) returns text
language plpgsql immutable as $$
begin
  return case p_type::text
    when 'quotation' then 'QT' when 'temp_delivery' then 'TD' when 'invoice' then 'INV'
    when 'billing' then 'BL' when 'receipt' then 'RE' when 'credit_note' then 'CN' when 'debit_note' then 'DN'
    when 'purchase_req' then 'PR' end;
end $$;

create or replace function public.next_sales_doc_no(p_company uuid, p_type public.sales_doc_type, p_date date default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_date date := coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date);
        v_ym text := to_char(v_date, 'YYYYMM'); v_prefix text := public.sales_prefix(p_type); v_n int; v_style text;
begin
  select doc_no_style into v_style from public.companies where id = p_company;
  if v_style = 'tks' and p_type::text = 'receipt' then v_prefix := 'RC'; end if;
  insert into public.sales_doc_counters (company_id, prefix, yyyymm, last_no) values (p_company, v_prefix, v_ym, 1)
    on conflict (company_id, prefix, yyyymm) do update set last_no = public.sales_doc_counters.last_no + 1
    returning last_no into v_n;
  if v_style = 'tks' then
    -- RC6910-0001 : ปี พ.ศ. 2 หลัก + เดือน + '-' + ลำดับ 4 หลัก
    return v_prefix || to_char((extract(year from v_date)::int + 543) % 100, 'FM00') || to_char(v_date, 'MM') || '-' || to_char(v_n, 'FM0000');
  end if;
  return v_prefix || v_ym || to_char(v_n, 'FM0000');
end $$;

-- allow VAT breakdown on a purchase requisition even though TKS is not VAT-registered (the supplier PKM is)
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
      case when not c.vat_registered and p_type::text <> 'purchase_req' then 'none' else coalesce(p_vat_mode, 'inclusive') end, 7, coalesce(p_discount_pct, 0), coalesce(p_discount_amount, 0),
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

-- ---------------------------------------------------------------------
-- Online sales per product: replace a day/channel's lines and refresh the daily header
-- ---------------------------------------------------------------------
create or replace function public.save_online_items(p_date date, p_channel text, p_items jsonb, p_orders int default null, p_fees numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; v_gross numeric := 0; v_qty numeric := 0;
begin
  if not public.can_sell() then raise exception 'ไม่มีสิทธิ์บันทึกยอดขาย'; end if;
  delete from public.online_sales_items where sale_date = p_date and channel = p_channel;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.online_sales_items (sale_date, channel, product_id, barcode, description, qty, unit_price, amount, order_ref, created_by)
    values (p_date, p_channel, nullif(it->>'product_id', '')::uuid, nullif(it->>'barcode', ''), it->>'description', coalesce((it->>'qty')::numeric, 1),
            coalesce((it->>'unit_price')::numeric, 0), round(coalesce((it->>'qty')::numeric, 1) * coalesce((it->>'unit_price')::numeric, 0), 2), nullif(it->>'order_ref', ''), public.current_app_user_id());
  end loop;
  select coalesce(sum(amount), 0), coalesce(sum(qty), 0) into v_gross, v_qty from public.online_sales_items where sale_date = p_date and channel = p_channel;
  insert into public.online_sales_daily (sale_date, channel, orders_count, gross_amount, fees, note, created_by)
  values (p_date, p_channel, coalesce(p_orders, 0), v_gross, coalesce(p_fees, 0), p_note, public.current_app_user_id())
  on conflict (sale_date, channel) do update set gross_amount = v_gross, orders_count = coalesce(p_orders, public.online_sales_daily.orders_count),
      fees = coalesce(p_fees, public.online_sales_daily.fees), note = coalesce(p_note, public.online_sales_daily.note);
  if v_gross = 0 and coalesce(p_orders, 0) = 0 and coalesce(p_fees, 0) = 0 then
    delete from public.online_sales_daily where sale_date = p_date and channel = p_channel;
  end if;
  return jsonb_build_object('gross', v_gross, 'qty', v_qty);
end $$;

-- ---------------------------------------------------------------------
-- Month close: what TKS sold in a month, per product → purchase requisition lines
--   sources: (a) TKS sales documents (invoices + receipts not derived from an invoice), (b) online items on channels billed to TKS
-- ---------------------------------------------------------------------
create or replace function public.tks_month_lines(p_month date) returns jsonb
language sql stable security definer set search_path = public as $$
  with tks as (select id, intercompany_discount_pct from public.companies where code = 'TKS'),
  mfrom as (select date_trunc('month', p_month)::date d), mto as (select (date_trunc('month', p_month) + interval '1 month - 1 day')::date d),
  docs as (
    select d.id, d.doc_no, d.doc_type from public.sales_docs d, tks, mfrom, mto
     where d.company_id = tks.id and d.status not in ('draft', 'cancelled') and d.doc_type::text in ('invoice', 'receipt')
       and d.doc_date between mfrom.d and mto.d
       and not (d.doc_type::text = 'receipt' and d.ref_doc_id is not null and exists (select 1 from public.sales_docs r where r.id = d.ref_doc_id and r.doc_type::text = 'invoice'))
  ),
  src as (
    select i.product_id, i.barcode, i.description, i.qty, i.amount, 'doc'::text as src, docs.doc_no as ref from public.sales_doc_items i join docs on docs.id = i.doc_id
    union all
    select o.product_id, o.barcode, o.description, o.qty, o.amount, 'online', o.channel from public.online_sales_items o join public.online_channels ch on ch.key = o.channel, mfrom, mto
     where ch.bills_to_tks and o.sale_date between mfrom.d and mto.d
  ),
  agg as (
    select coalesce(p.id, null) as product_id, coalesce(p.code, '') as code, coalesce(p.name, max(s.description)) as name, coalesce(p.barcode, max(s.barcode)) as barcode,
           sum(s.qty) as qty, coalesce(p.price, 0) as retail, round(coalesce(p.price, 0) * (1 - (select intercompany_discount_pct from tks) / 100), 2) as wholesale,
           sum(s.amount) as sold_amount, array_agg(distinct s.ref) as refs
      from src s left join public.products p on p.id = s.product_id or (s.product_id is null and p.barcode = s.barcode)
     group by p.id, p.code, p.name, p.barcode, p.price
  )
  select jsonb_build_object(
    'month', to_char((select d from mfrom), 'YYYY-MM'),
    'discount_pct', (select intercompany_discount_pct from tks),
    'doc_refs', (select coalesce(jsonb_agg(doc_no order by doc_no), '[]'::jsonb) from docs),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'code', code, 'description', name, 'barcode', barcode, 'qty', qty, 'retail', retail,
                                              'unit_price', wholesale, 'amount', round(qty * wholesale, 2), 'sold_amount', sold_amount, 'refs', refs) order by qty desc, name), '[]'::jsonb) from agg),
    'total_qty', (select coalesce(sum(qty), 0) from agg),
    'total_amount', (select coalesce(sum(round(qty * wholesale, 2)), 0) from agg),
    'existing_pr', (select jsonb_agg(jsonb_build_object('id', d.id, 'doc_no', d.doc_no, 'status', d.status)) from public.sales_docs d, tks
                      where d.company_id = tks.id and d.doc_type::text = 'purchase_req' and d.status <> 'cancelled' and d.internal_note like 'month:' || to_char((select d from mfrom), 'YYYY-MM') || '%')
  );
$$;

-- create the PR (TKS → PKM) for a month
create or replace function public.create_purchase_requisition(p_month date, p_doc_date date default null, p_lines jsonb default null)
returns public.sales_docs language plpgsql security definer set search_path = public as $$
declare tks public.companies; pkm public.companies; v jsonb; v_lines jsonb; v_refs text; d public.sales_docs; v_month text := to_char(date_trunc('month', p_month), 'YYYY-MM');
begin
  if not public.can_sell() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into tks from public.companies where code = 'TKS'; select * into pkm from public.companies where code = 'PKM';
  if exists (select 1 from public.sales_docs where company_id = tks.id and doc_type::text = 'purchase_req' and status <> 'cancelled' and internal_note like 'month:' || v_month || '%') then
    raise exception 'เดือน % มีใบเบิกซื้อแล้ว (ยกเลิกใบเดิมก่อนถ้าต้องการออกใหม่)', v_month;
  end if;
  v := public.tks_month_lines(p_month);
  v_lines := coalesce(p_lines, v->'lines');
  if jsonb_array_length(v_lines) = 0 then raise exception 'ไม่มียอดขายของทีฆาซอร์สในเดือน %', v_month; end if;
  select string_agg(x, ', ') into v_refs from jsonb_array_elements_text(v->'doc_refs') x;
  d := public.create_sales_doc(
    tks.id, 'purchase_req'::public.sales_doc_type, null, pkm.name_th, pkm.address_th, pkm.tax_id, pkm.branch,
    coalesce(p_doc_date, (date_trunc('month', p_month) + interval '1 month')::date), null, null, 'intercompany', null, null, null,
    'inclusive', 0, 0, 0, null, 0,
    format('เบิกซื้อสินค้าในราคาส่ง ตามยอดขายประจำเดือน %s · ราคาส่ง = ราคาขาย ลด %s%% (รวม VAT)%s',
           (array['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'])[extract(month from p_month)::int] || ' ' || (extract(year from p_month)::int + 543),
           trim(trailing '.' from trim(trailing '0' from (v->>'discount_pct'))), case when v_refs is not null then ' · ยอดขายตามเอกสาร ' || v_refs else '' end),
    'month:' || v_month, null, false,
    (select jsonb_agg(jsonb_build_object('product_id', l->>'product_id', 'description', l->>'description', 'barcode', l->>'barcode', 'qty', l->>'qty', 'unit', 'ชิ้น', 'unit_price', l->>'unit_price')) from jsonb_array_elements(v_lines) l),
    null, 'month_close');
  return d;
end $$;

-- PKM issues the matching tax invoice to TKS from a PR (deducts main-warehouse stock when issued)
create or replace function public.issue_intercompany_invoice(p_pr uuid, p_doc_date date default null)
returns public.sales_docs language plpgsql security definer set search_path = public as $$
declare pr public.sales_docs; pkm public.companies; tks public.companies; v_cust uuid; inv public.sales_docs; v_items jsonb;
begin
  if not public.can_sell() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into pr from public.sales_docs where id = p_pr;
  if pr.id is null or pr.doc_type::text <> 'purchase_req' then raise exception 'ไม่ใช่ใบเบิกซื้อ'; end if;
  if pr.status = 'cancelled' then raise exception 'ใบเบิกซื้อถูกยกเลิก'; end if;
  if exists (select 1 from public.sales_docs where ref_doc_id = p_pr and doc_type::text = 'invoice' and status <> 'cancelled') then raise exception 'ใบเบิกซื้อนี้ออกใบกำกับแล้ว'; end if;
  select * into pkm from public.companies where code = 'PKM'; select * into tks from public.companies where code = 'TKS';
  select id into v_cust from public.contacts where kind = 'customer' and (tax_id = tks.tax_id or name ilike '%ทีฆาซอร์ส%') limit 1;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'description', description, 'barcode', barcode, 'qty', qty, 'unit', unit, 'unit_price', unit_price, 'discount_pct', discount_pct) order by line_no)
    into v_items from public.sales_doc_items where doc_id = p_pr;
  inv := public.create_sales_doc(pkm.id, 'invoice'::public.sales_doc_type, v_cust, tks.name_th, tks.address_th, tks.tax_id, tks.branch,
    coalesce(p_doc_date, pr.doc_date), null, null, 'intercompany', pr.id, pr.doc_no, pr.doc_no, 'inclusive', pr.discount_pct, pr.discount_amount, 0, null, 0,
    'ขายสินค้าราคาส่งให้ บริษัท ทีฆาซอร์ส จำกัด ตาม' || pr.doc_no, pr.internal_note, null, true, v_items, null, 'month_close');
  update public.sales_docs set ref_doc_no = inv.doc_no, status = case when status = 'draft' then 'issued' else status end where id = p_pr;
  return inv;
end $$;
