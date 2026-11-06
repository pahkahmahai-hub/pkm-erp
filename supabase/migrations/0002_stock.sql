-- =====================================================================
-- PKM ERP — Stock module (คลังใหญ่) + shared contacts (ลูกค้า / ซัพพลายเออร์)
-- Requires 0001_foundation_hr.sql. Run once in Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Shared contacts (used by stock now, sales/purchasing later)
-- ---------------------------------------------------------------------
create type public.contact_kind as enum ('customer', 'supplier');

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  kind          public.contact_kind not null,
  code          text,
  entity_type   text not null default 'company',   -- company / person
  country       text not null default 'TH',
  name          text not null,
  address       text, address2 text, address3 text, postcode text,
  tax_id        text, branch_code text, branch_name text,
  contact_name  text, email text, mobile text, office_phone text,
  credit_days   int not null default 0,
  note          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.contacts (kind, name);
create trigger contacts_updated before update on public.contacts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Products
-- ---------------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  barcode     text unique,
  name        text not null,
  dept        text,
  sub_dept    text,
  unit        text not null default 'ชิ้น',
  price       numeric(12,2) not null default 0,   -- ราคาขาย
  cost        numeric(12,2),                      -- ต้นทุน (optional)
  stock_qty   int not null default 0,             -- สินค้าดีในคลังใหญ่
  defect_qty  int not null default 0,             -- ของเสียที่ยังค้างอยู่
  min_alert   int not null default 0,
  image_url   text,
  notes       text,
  is_active   boolean not null default true,
  sort_order  int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.products (name);
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Movements (ทุกการเคลื่อนไหวของสินค้าลงตารางนี้)
-- ---------------------------------------------------------------------
create type public.movement_type as enum (
  'opening',          -- ยอดยกมา
  'receive',          -- รับเข้าจากซัพพลายเออร์
  'issue',            -- เบิกออก
  'adjust',           -- ปรับยอด (นับสต็อก)
  'defect_in',        -- รับเข้าเป็นของเสีย (ไม่เข้าสต็อกดี)
  'defect_restore',   -- ของเสียตรวจแล้วดี → กลับเข้าสต็อก
  'defect_return',    -- ส่งคืนซัพพลายเออร์
  'defect_dispose'    -- ตัดทิ้ง
);

create table public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  movement_type   public.movement_type not null,
  qty             int not null,              -- +เข้า / −ออก (สำหรับสต็อกดี); ของเสียใช้ defect_delta
  defect_delta    int not null default 0,    -- การเปลี่ยนแปลงของ defect_qty
  balance_after   int not null,              -- stock_qty หลังรายการนี้
  ref_table       text,                      -- receipts / issues / defects / null
  ref_id          uuid,
  ref_no          text,
  note            text,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now()
);
create index on public.stock_movements (product_id, created_at desc);
create index on public.stock_movements (created_at desc);

-- ---------------------------------------------------------------------
-- 4. Receipts (รับเข้า) / Issues (ใบเบิก) / Defects (ของเสีย)
-- ---------------------------------------------------------------------
create type public.payment_status as enum ('unpaid', 'paid');
create type public.item_condition as enum ('good', 'defect');
create type public.defect_status as enum ('review', 'return_pending', 'returned', 'disposed', 'restored');

create table public.doc_counters (
  prefix   text not null,
  yymm     text not null,
  last_no  int not null default 0,
  primary key (prefix, yymm)
);

create table public.receipts (
  id               uuid primary key default gen_random_uuid(),
  receipt_no       text not null unique,
  receipt_date     date not null default (now() at time zone 'Asia/Bangkok')::date,
  supplier_id      uuid references public.contacts(id),
  supplier_doc_no  text,                       -- เลขที่ใบส่งของของซัพพลายเออร์
  payment_status   public.payment_status not null default 'unpaid',
  paid_at          date,
  note             text,
  total_good       int not null default 0,
  total_defect     int not null default 0,
  created_by       uuid references public.app_users(id),
  created_at       timestamptz not null default now()
);

create table public.receipt_items (
  id             uuid primary key default gen_random_uuid(),
  receipt_id     uuid not null references public.receipts(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  qty            int not null check (qty > 0),
  condition      public.item_condition not null default 'good',
  defect_action  public.defect_status,          -- review / return_pending เมื่อ condition = defect
  unit_cost      numeric(12,2),
  note           text
);

create table public.issues (
  id             uuid primary key default gen_random_uuid(),
  issue_no       text not null unique,
  issue_date     date not null default (now() at time zone 'Asia/Bangkok')::date,
  customer_id    uuid references public.contacts(id),
  source         text not null default 'manual',  -- manual / flowaccount_pdf / flowaccount_api
  source_doc_no  text,                            -- เลขที่ใบส่งของ/ใบกำกับ FlowAccount
  purpose        text,                            -- เบิกไปทำอะไร
  total_qty      int not null default 0,
  created_by     uuid references public.app_users(id),
  created_at     timestamptz not null default now()
);

create table public.issue_items (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.issues(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  qty         int not null check (qty > 0),
  note        text
);

create table public.defects (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id),
  qty              int not null check (qty > 0),
  status           public.defect_status not null default 'review',
  receipt_id       uuid references public.receipts(id) on delete set null,
  receipt_item_id  uuid references public.receipt_items(id) on delete set null,
  supplier_id      uuid references public.contacts(id),
  note             text,
  created_by       uuid references public.app_users(id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references public.app_users(id),
  updated_at       timestamptz not null default now()
);
create index on public.defects (status);

-- ---------------------------------------------------------------------
-- 5. Materials — ลายผ้า (ผืน) / แพคเกจจิ้ง (ชิ้น)
-- ---------------------------------------------------------------------
create type public.material_kind as enum ('fabric', 'packaging');

create table public.materials (
  id          uuid primary key default gen_random_uuid(),
  kind        public.material_kind not null,
  code        text,
  name        text not null,
  unit        text not null,              -- ผืน / ชิ้น
  qty         numeric(12,2) not null default 0,
  min_alert   numeric(12,2) not null default 0,
  image_url   text,
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger materials_updated before update on public.materials for each row execute function public.set_updated_at();

create table public.material_movements (
  id             uuid primary key default gen_random_uuid(),
  material_id    uuid not null references public.materials(id) on delete cascade,
  movement_type  text not null,             -- opening / receive / issue / adjust
  qty            numeric(12,2) not null,    -- +เข้า / −ออก
  balance_after  numeric(12,2) not null,
  supplier_id    uuid references public.contacts(id),
  note           text,
  created_by     uuid references public.app_users(id),
  created_at     timestamptz not null default now()
);
create index on public.material_movements (material_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Functions
-- ---------------------------------------------------------------------
create or replace function public.current_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.app_users where auth_user_id = auth.uid() and is_active limit 1;
$$;

-- running document number: RC-6911-001
create or replace function public.next_doc_no(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_yymm text := to_char(((now() at time zone 'Asia/Bangkok')::date + interval '543 years'), 'YYMM');
  v_n int;
begin
  insert into public.doc_counters (prefix, yymm, last_no) values (p_prefix, v_yymm, 1)
    on conflict (prefix, yymm) do update set last_no = public.doc_counters.last_no + 1
    returning last_no into v_n;
  return p_prefix || '-' || v_yymm || '-' || to_char(v_n, 'FM000');
end $$;

-- atomic stock change + movement log
create or replace function public.apply_movement(
  p_product_id uuid, p_type public.movement_type, p_qty int, p_defect_delta int default 0,
  p_ref_table text default null, p_ref_id uuid default null, p_ref_no text default null, p_note text default null
) returns public.stock_movements
language plpgsql security definer set search_path = public as $$
declare
  v_bal int;
  v_row public.stock_movements;
begin
  update public.products
     set stock_qty = stock_qty + p_qty,
         defect_qty = defect_qty + p_defect_delta
   where id = p_product_id
  returning stock_qty into v_bal;
  if v_bal is null then raise exception 'ไม่พบสินค้า'; end if;
  if v_bal < 0 then raise exception 'สต็อกไม่พอ (คงเหลือ %)', v_bal - p_qty; end if;

  insert into public.stock_movements (product_id, movement_type, qty, defect_delta, balance_after, ref_table, ref_id, ref_no, note, created_by)
  values (p_product_id, p_type, p_qty, p_defect_delta, v_bal, p_ref_table, p_ref_id, p_ref_no, p_note, public.current_app_user_id())
  returning * into v_row;
  return v_row;
end $$;

-- create a receipt with its items in one call; items = jsonb array
-- [{product_id, qty, condition:'good'|'defect', defect_action:'review'|'return_pending', unit_cost, note}]
create or replace function public.create_receipt(
  p_supplier_id uuid, p_supplier_doc_no text, p_receipt_date date, p_payment_status public.payment_status,
  p_note text, p_items jsonb
) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare
  v_rc public.receipts;
  v_item jsonb;
  v_ri_id uuid;
  v_good int := 0; v_def int := 0;
  v_qty int; v_cond text; v_pid uuid; v_act public.defect_status;
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  insert into public.receipts (receipt_no, receipt_date, supplier_id, supplier_doc_no, payment_status, paid_at, note, created_by)
  values (public.next_doc_no('RC'), coalesce(p_receipt_date, (now() at time zone 'Asia/Bangkok')::date), p_supplier_id, p_supplier_doc_no,
          p_payment_status, case when p_payment_status = 'paid' then (now() at time zone 'Asia/Bangkok')::date end, p_note, public.current_app_user_id())
  returning * into v_rc;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_cond := coalesce(v_item->>'condition', 'good');
    insert into public.receipt_items (receipt_id, product_id, qty, condition, defect_action, unit_cost, note)
    values (v_rc.id, v_pid, v_qty, v_cond::public.item_condition,
            case when v_cond = 'defect' then coalesce(v_item->>'defect_action', 'review')::public.defect_status end,
            nullif(v_item->>'unit_cost', '')::numeric, v_item->>'note')
    returning id into v_ri_id;

    if v_cond = 'good' then
      v_good := v_good + v_qty;
      perform public.apply_movement(v_pid, 'receive', v_qty, 0, 'receipts', v_rc.id, v_rc.receipt_no, v_item->>'note');
    else
      v_def := v_def + v_qty;
      v_act := coalesce(v_item->>'defect_action', 'review')::public.defect_status;
      insert into public.defects (product_id, qty, status, receipt_id, receipt_item_id, supplier_id, note, created_by, updated_by)
      values (v_pid, v_qty, v_act, v_rc.id, v_ri_id, p_supplier_id, v_item->>'note', public.current_app_user_id(), public.current_app_user_id());
      perform public.apply_movement(v_pid, 'defect_in', 0, v_qty, 'receipts', v_rc.id, v_rc.receipt_no, coalesce(v_item->>'note', 'ของเสียจากการรับเข้า'));
    end if;
  end loop;

  update public.receipts set total_good = v_good, total_defect = v_def where id = v_rc.id returning * into v_rc;
  return v_rc;
end $$;

-- create an issue (ใบเบิก) with items; stock is deducted atomically
create or replace function public.create_issue(
  p_customer_id uuid, p_issue_date date, p_source text, p_source_doc_no text, p_purpose text, p_items jsonb
) returns public.issues
language plpgsql security definer set search_path = public as $$
declare
  v_is public.issues;
  v_item jsonb;
  v_total int := 0;
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  insert into public.issues (issue_no, issue_date, customer_id, source, source_doc_no, purpose, created_by)
  values (public.next_doc_no('IS'), coalesce(p_issue_date, (now() at time zone 'Asia/Bangkok')::date), p_customer_id,
          coalesce(p_source, 'manual'), p_source_doc_no, p_purpose, public.current_app_user_id())
  returning * into v_is;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.issue_items (issue_id, product_id, qty, note)
    values (v_is.id, (v_item->>'product_id')::uuid, (v_item->>'qty')::int, v_item->>'note');
    v_total := v_total + (v_item->>'qty')::int;
    perform public.apply_movement((v_item->>'product_id')::uuid, 'issue', -((v_item->>'qty')::int), 0,
                                  'issues', v_is.id, v_is.issue_no, coalesce(p_purpose, v_item->>'note'));
  end loop;

  update public.issues set total_qty = v_total where id = v_is.id returning * into v_is;
  return v_is;
end $$;

-- stock count adjustment
create or replace function public.adjust_stock(p_product_id uuid, p_new_qty int, p_reason text)
returns public.stock_movements
language plpgsql security definer set search_path = public as $$
declare v_cur int;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'ต้องระบุเหตุผลการปรับยอด'; end if;
  select stock_qty into v_cur from public.products where id = p_product_id;
  return public.apply_movement(p_product_id, 'adjust', p_new_qty - v_cur, 0, null, null, null, p_reason);
end $$;

-- change a defect's status (review → return_pending → returned / disposed / restored)
create or replace function public.update_defect(p_defect_id uuid, p_status public.defect_status, p_note text default null)
returns public.defects
language plpgsql security definer set search_path = public as $$
declare v_d public.defects;
begin
  select * into v_d from public.defects where id = p_defect_id;
  if v_d.id is null then raise exception 'ไม่พบรายการ'; end if;
  if v_d.status in ('returned', 'disposed', 'restored') then raise exception 'รายการนี้ปิดแล้ว'; end if;

  if p_status = 'restored' then
    perform public.apply_movement(v_d.product_id, 'defect_restore', v_d.qty, -v_d.qty, 'defects', v_d.id, null, coalesce(p_note, 'ตรวจแล้วใช้ได้ กลับเข้าสต็อก'));
  elsif p_status = 'returned' then
    perform public.apply_movement(v_d.product_id, 'defect_return', 0, -v_d.qty, 'defects', v_d.id, null, coalesce(p_note, 'ส่งคืนซัพพลายเออร์'));
  elsif p_status = 'disposed' then
    perform public.apply_movement(v_d.product_id, 'defect_dispose', 0, -v_d.qty, 'defects', v_d.id, null, coalesce(p_note, 'ตัดทิ้ง'));
  end if;

  update public.defects set status = p_status, note = coalesce(p_note, note), updated_by = public.current_app_user_id(), updated_at = now()
   where id = p_defect_id returning * into v_d;
  return v_d;
end $$;

-- material in/out
create or replace function public.move_material(p_material_id uuid, p_type text, p_qty numeric, p_note text default null, p_supplier_id uuid default null)
returns public.material_movements
language plpgsql security definer set search_path = public as $$
declare v_bal numeric; v_row public.material_movements;
begin
  update public.materials set qty = qty + p_qty where id = p_material_id returning qty into v_bal;
  if v_bal is null then raise exception 'ไม่พบรายการ'; end if;
  if v_bal < 0 then raise exception 'คงเหลือไม่พอ'; end if;
  insert into public.material_movements (material_id, movement_type, qty, balance_after, supplier_id, note, created_by)
  values (p_material_id, p_type, p_qty, v_bal, p_supplier_id, p_note, public.current_app_user_id())
  returning * into v_row;
  return v_row;
end $$;

-- dashboard summary for a date range
create or replace function public.stock_summary(p_from date, p_to date)
returns table (received int, issued int, defects_in int, adjustments int, issues_count int, receipts_count int)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(qty) from public.stock_movements where movement_type = 'receive' and (created_at at time zone 'Asia/Bangkok')::date between p_from and p_to), 0)::int,
    coalesce((select -sum(qty) from public.stock_movements where movement_type = 'issue' and (created_at at time zone 'Asia/Bangkok')::date between p_from and p_to), 0)::int,
    coalesce((select sum(defect_delta) from public.stock_movements where movement_type = 'defect_in' and (created_at at time zone 'Asia/Bangkok')::date between p_from and p_to), 0)::int,
    coalesce((select count(*) from public.stock_movements where movement_type = 'adjust' and (created_at at time zone 'Asia/Bangkok')::date between p_from and p_to), 0)::int,
    coalesce((select count(*) from public.issues where issue_date between p_from and p_to), 0)::int,
    coalesce((select count(*) from public.receipts where receipt_date between p_from and p_to), 0)::int;
$$;

-- ---------------------------------------------------------------------
-- 7. RLS — every signed-in user can work the warehouse; writes are attributed via created_by
-- ---------------------------------------------------------------------
alter table public.contacts           enable row level security;
alter table public.products           enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.doc_counters       enable row level security;
alter table public.receipts           enable row level security;
alter table public.receipt_items      enable row level security;
alter table public.issues             enable row level security;
alter table public.issue_items        enable row level security;
alter table public.defects            enable row level security;
alter table public.materials          enable row level security;
alter table public.material_movements enable row level security;

do $$ declare t text; begin
  foreach t in array array['contacts','products','receipts','receipt_items','issues','issue_items','defects','materials'] loop
    execute format('create policy "%s read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s write" on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy "%s update" on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy "%s delete" on public.%I for delete to authenticated using (true)', t, t);
  end loop;
end $$;
-- movement logs are append-only (written by security-definer functions), readable by all
create policy "movements read" on public.stock_movements for select to authenticated using (true);
create policy "mat movements read" on public.material_movements for select to authenticated using (true);
create policy "counters admin" on public.doc_counters for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Storage bucket for product / material images
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('stock-images', 'stock-images', true)
  on conflict (id) do nothing;
create policy "stock images read"   on storage.objects for select using (bucket_id = 'stock-images');
create policy "stock images write"  on storage.objects for insert to authenticated with check (bucket_id = 'stock-images');
create policy "stock images update" on storage.objects for update to authenticated using (bucket_id = 'stock-images');
create policy "stock images delete" on storage.objects for delete to authenticated using (bucket_id = 'stock-images');

-- ---------------------------------------------------------------------
-- 9. Seed — products (189) + contacts (452) from the exported files, 6 Nov 2569
-- ---------------------------------------------------------------------
insert into public.products (code, name, barcode, dept, sub_dept, price, stock_qty, min_alert, sort_order) values
('P001','PAHKAHMAH GIFTSET PCM+FB','8852468452240','LIFESTYLE','SOUVENIR',450,0,0,1),
('RDB','PAHKAHMAH ROUNDIE BAG','8852468452226','LIFESTYLE','SOUVENIR',990,15,20,2),
('UBW','PAHKAHMAH UNI BREEZE WRAP','8852468452219','LIFESTYLE','SOUVENIR',390,69,20,3),
('GS-DJP','PAHKAHMAH GIFT SET DOK JAMPEE','8852468452202','LIFESTYLE','SOUVENIR',590,1,0,4),
('GS-HNY','PAHKAHMAH GIFT SET DOK HANG NOK YUNG','8852468452196','LIFESTYLE','SOUVENIR',550,1,0,5),
('TLH','PAHKAHMAH TULIP HAT','8852468452189','LIFESTYLE','SOUVENIR',550,82,20,6),
('MDH','PAHKAHMAH MADA WIDE BRIM HAT','8852468452172','LIFESTYLE','SOUVENIR',790,120,20,7),
('CLC','PAHKAHMAH LUCKY CAT CHARM','8852468452165','LIFESTYLE','SOUVENIR',259,0,0,8),
('E2DKC','PAHKAHMAH ELEPHANT 2D KEYCHAIN','8852468452158','LIFESTYLE','SOUVENIR',169,0,0,9),
('HKC','PAHKAHMAH HORSE KEYCHAIN','8852468452073','LIFESTYLE','SOUVENIR',295,19,20,10),
('GS-RK','PAHKAHMAH GIFT SET - ROM KLAO','8852468452066','LIFESTYLE','SOUVENIR',1590,1,0,11),
('GS-CK','PAHKAHMAH GIFT SET - CHAROEN KRUNG','8852468452059','LIFESTYLE','SOUVENIR',1590,1,0,12),
('HFP-HR','PAHKAHMAH HORSE HANDFAN','8852468452042','LIFESTYLE','SOUVENIR',290,0,0,13),
('CPHB','PAHKAHMAH HORSE BEAD PHONE CHARM','8852468452035','LIFESTYLE','SOUVENIR',249,0,20,14),
('CPEB','PAHKAHMAH ELEPHANT BEAD PHONE CHARM','8852468452028','LIFESTYLE','SOUVENIR',249,0,20,15),
('CWDB','PAHKAHMAH WHALE DUO BEAD CHARM','8852468452011','LIFESTYLE','SOUVENIR',249,0,20,16),
('CHDB','PAHKAHMAH HORSE DUO BEAD CHARM','8852468452004','LIFESTYLE','SOUVENIR',249,0,20,17),
('CEDB','PAHKAHMAH ELEPHANT DUO BEAD CHARM','8852468451991','LIFESTYLE','SOUVENIR',249,0,20,18),
('ETMKC','PAHKAHMAH ELEPHIE TASSEL KEYCHAIN - M','8852468451915','LIFESTYLE','SOUVENIR',395,61,20,19),
('ETSKC','PAHKAHMAH ELEPHIE TASSEL KEYCHAIN - S','8852468451908','LIFESTYLE','SOUVENIR',359,0,20,20),
('EDMKC','PAHKAHMAH ELEPHIE DEVIL KEYCHAIN - M','8852468451892','LIFESTYLE','SOUVENIR',379,58,20,21),
('EDSKC','PAHKAHMAH ELEPHIE DEVIL KEYCHAIN - S','8852468451885','LIFESTYLE','SOUVENIR',329,60,20,22),
('CJKLP','PAHKAHMAH JOCKEY LONG PANT','8852468451878','UNISEX','APPAREL',890,51,15,23),
('FBD','PAHKAHMAH FOLDABLE BAG-THAI CLASSICAL DANCE','8852468451861','LIFESTYLE','SOUVENIR',349,7,20,24),
('FBWT','PAHKAHMAH FOLDABLE BAG-WAT THAI','8852468451847','LIFESTYLE','SOUVENIR',349,12,20,25),
('FBM','PAHKAHMAH FOLDABLE BAG-MANGO STICKY RICE','8852468451854','LIFESTYLE','SOUVENIR',349,19,20,26),
('EKCHX','PAHKAHMAH GIFT BOX ELEPHANT KEY CHAIN','8852468451830','LIFESTYLE','SOUVENIR',129,1752,200,27),
('EMG-MM','PAHKAHMAH MOM&ME ELEPHANT MAGNET','8852468451816','LIFESTYLE','SOUVENIR',179,1,0,28),
('TKC','PAHKAHMAH TURTLE KEYCHAIN','8852468451793','LIFESTYLE','SOUVENIR',189,153,20,29),
('P030','PAHKAHMAH TURTLE LONG NECKLACE','8852468451809','LIFESTYLE','SOUVENIR',259,0,20,30),
('PTS-CF','PAHKAHMAH T-SHIRT - CF COLLECTION','8852468451823','UNISEX','APPAREL',590,22,10,31),
('FKC','PAHKAHMAH FISH KEYCHAIN','8852468451786','LIFESTYLE','SOUVENIR',189,10,20,32),
('ELN','PAHKAHMAH ELEPHANT LONG NECKLACE','8852468451779','LIFESTYLE','SOUVENIR',259,180,20,33),
('PKBF','PAHKAHMAH BUFFALO DOLL','8852468451762','LIFESTYLE','SOUVENIR',480,1,0,34),
('CRDS','PAHKAHMAH RONDA SKIRT','8852468451755','WOMEN','APPAREL',890,0,15,35),
('CCSP','PAHKAHMAH COCO SHORT PANT','8852468451748','WOMEN','APPAREL',550,24,15,36),
('CEPRS','PAHKAHMAH ELEPHANT LONG RUFFLE SKIRT','8852468451731','WOMEN','APPAREL',680,110,20,37),
('CPRP','PAHKAHMAH  PERANAKAN PANT','8852468451649','UNISEX','APPAREL',590,0,0,38),
('CPRS','PAHKAHMAH  PERANAKAN SHIRT','8852468451632','UNISEX','APPAREL',588,0,0,39),
('CPPP','PAHKAHMAH  PIG PAKAOMA PANT','8852468451670','UNISEX','APPAREL',590,0,0,40),
('FBDB','PAHKAHMAH FOLDABLE BEAR DOLL BAG','8852468451694','LIFESTYLE','SOUVENIR',490,241,20,41),
('FEDB','PAHKAHMAH FOLDABLE ELEPHANT DOLL BAG','8852468451687','LIFESTYLE','SOUVENIR',490,30,0,42),
('EBSK','PAHKAHMAH ELEPHANT BOXING STD KEYCHAIN','8852468451717','LIFESTYLE','SOUVENIR',359,24,20,43),
('EBKC-PKM','PAHKAHMAH ELEPHANT BOXING KEYCHAIN-PKM','8852468451700','LIFESTYLE','SOUVENIR',390,4,20,44),
('PTP-BL','PKM - T - SHIRT - BILLIONAIRE ELEPHANT MIX COLOR','8852468451618','UNISEX','APPAREL',498,0,0,45),
('CLY','PAHKAHMAH เสื้อผ้าขาวม้ารุ่น LILY (CLY) MIX COLOR','8852468451595','WOMEN','APPAREL',790,62,15,46),
('CLK','PAHKAHMAH กางเกงผ้าขาวม้ารุ่น LUKA  (CLK) MIX COLOR','8852468451588','WOMEN','APPAREL',998,0,15,47),
('CDN','PAHKAHMAH DIANA-  (CDN) MIX COLOR','8852468451571','WOMEN','APPAREL',1290,13,15,48),
('CZB','PAHKAHMAH ZABRINA -  (CZB) MIX COLOR','8852468451564','WOMEN','APPAREL',1790,0,15,49),
('RCP','PAHKAHMAH ROUND COIN POUCH MIX COLOR','8852468451533','LIFESTYLE','SOUVENIR',290,98,20,50),
('GSW-A','PAHKAHMAH GIFT SET WOOD BASKET - A MIX COLOR','8852468451557','LIFESTYLE','SOUVENIR',2290,0,0,51),
('GS-BR','PAHKAHMAH GIFT SET BOX - A MIX COLOR','8852468451540','LIFESTYLE','SOUVENIR',1190,0,0,52),
('EBKC','PAHKAHMAH ELEPHANT BOXING KEYCHAIN MIX COLOR','8852468451489','LIFESTYLE','SOUVENIR',390,62,20,53),
('SE-B','PAHKAHMAH ELEPHIE STICKER - VERSION B MIX COLOR','8852468451441','LIFESTYLE','SOUVENIR',79,100,0,54),
('SE-A','PAHKAHMAH ELEPHIE STICKER - VERSION A MIX COLOR','8852468451434','LIFESTYLE','SOUVENIR',59,400,0,55),
('CMK','PAHKAHMAH MANDARIN COLLAR SHIRT MIX COLOR','8852468451458','MEN','APPAREL',890,3,0,56),
('CANK-LPT','PAHKAHMAH ANIKA LONG PANTS MIX COLOR','8852468451410','WOMEN','APPAREL',990,1,10,57),
('EKCHBM','PAHKAHMAH BELL ELEPHANT KEY - M MIX COLOR','8852468451403','LIFESTYLE','SOUVENIR',189,256,200,58),
('EDH','PAHKAHMAH ELEPHANT HOLDER MIX COLOR','8852468451427','LIFESTYLE','SOUVENIR',390,71,20,59),
('ERDL','PAHKAHMAH ROYAL STANDING ELEPHANT - L MIX COLOR','8852468451397','LIFESTYLE','SOUVENIR',459,212,50,60),
('P061','PAHKAHMAH ROYAL STANDING ELEPHANT - M MIX COLOR','8852468451380','LIFESTYLE','SOUVENIR',429,0,0,61),
('RTB','PKM - ROLL TOP BACKPACK MIX COLOR','8852468451373','UNISEX','ACCESSORIES',3950,26,10,62),
('CPR','PKM - RUBBER CAP MIX COLOR','8852468451366','UNISEX','ACCESSORIES',990,22,0,63),
('NNB - L','PAHKAHMAH NUMNIM  BAG - M MIX COLOR','8852468451359','WOMEN','ACCESSORIES',790,0,0,64),
('NNB - M','PAHKAHMAH NUMNIM  BAG - L MIX COLOR','8852468451342','WOMEN','ACCESSORIES',590,0,0,65),
('PKM-4W-TB','กระเป๋าผ้าขาวม้ากันน้ำ PKM TOTEBAG - 4 WAY MIX COLOR 40 X 50 CM.','8852468451335','MEN','ACCESSORIES',2750,64,10,66),
('CBTP','PAHKAHMAH BARTON PANTS FREE SIZE','8852468451311','UNISEX','APPAREL',790,74,15,67),
('CCSS','PAHKAHMAH CASSIE SHIRT FREE SIZE','8852468451304','WOMEN','APPAREL',749,38,15,68),
('P069','PAHKAHMAH ALINDA DRESS FREE SIZE','8852468451298','LIFESTYLE','SOUVENIR',1290,0,0,69),
('PCL','PAHKAHMAH POUCH - L','8852468451281','LIFESTYLE','SOUVENIR',249,0,0,70),
('PCM','PAHKAHMAH POUCH - M','8852468451274','LIFESTYLE','SOUVENIR',169,266,50,71),
('PCS','PAHKAHMAH POUCH - S','8852468451267','LIFESTYLE','SOUVENIR',149,248,50,72),
('P073','PAHKAHMAH -TYLER SHORT PANT','8852468451250','UNISEX','APPAREL',690,0,0,73),
('P074','PKM- LP LONG PANT','8852468451243','UNISEX','APPAREL',790,0,0,74),
('PKM- STS','PKM- STS SHORT T SHIRT','8852468451236','UNISEX','APPAREL',750,0,0,75),
('CLND','PAHKAHMAH - LEENA DRESS','8852468451229','WOMEN','APPAREL',890,80,20,76),
('P077','COUPLE ELEPHANT KC IN BASKET','8852468451175','LIFESTYLE','SOUVENIR',175,0,0,77),
('P078','PKM - TB2- WHITE','8852468451212','UNISEX','ACCESSORIES',2450,0,0,78),
('PKM-TB2- GRAY','PKM - TB2- GRAY','8852468451205','UNISEX','ACCESSORIES',2450,64,10,79),
('P080','PKM - TB2- BLACK','8852468451199','UNISEX','ACCESSORIES',2450,0,0,80),
('EBG','PAHKAHMAH GIANT ELEPHANT BOXING DOLL','8852468451106','LIFESTYLE','SOUVENIR',3500,0,0,81),
('PCP','PAHKAHMAH CAT PILLOW','8852468451151','LIFESTYLE','SOUVENIR',342,2,10,82),
('CEPS','PKM PRT ELEPHANT PAKAOMA SHIRT','8852468451090','UNISEX','APPAREL',588,156,20,83),
('PTS-P','PAHKAHMAH T- SHIRT PREMIUM','8852468451168','UNISEX','APPAREL',398,0,0,84),
('PTP-WE','PKM T-SHIRT - WEALTHY ELEPHANT','8852468451137','UNISEX','APPAREL',498,0,0,85),
('PTP-VE','PKM T-SHIRT - VICTORY ELEPHANT','8852468451120','UNISEX','APPAREL',498,0,0,86),
('PTP-LE','PKM T-SHIRT - LUCKY ELEPHANT','8852468451113','UNISEX','APPAREL',498,0,0,87),
('P088','PAHKAHMAH ELEPHANT BOXING TRAVEL BOTTLES KIT DUO','8852468451069','LIFESTYLE','SOUVENIR',498,0,0,88),
('TBGN','PAHKAHMAH GANESHA TRAVEL BOTTLES KIT','8852468451052','LIFESTYLE','SOUVENIR',289,0,0,89),
('TBEB','PAHKAHMAH ELEPHANT BOXING TRAVEL BOTTLES KIT','8852468451045','LIFESTYLE','SOUVENIR',255,0,0,90),
('CEPP','PAHKAHMAH ELEPHANT PAKAOMA PANT','8852468450925','UNISEX','APPAREL',590,254,20,91),
('CMSK','PAHKAHMAH MISAKI SHIRT','8852468450918','UNISEX','APPAREL',788,68,15,92),
('CSTM','PAHKAHMAH SATOMI PANT','8852468450901','UNISEX','APPAREL',998,14,15,93),
('EKCBD','PAHKAHMAH ELEPHANT BOXING KEYCHAIN','8852468450871','LIFESTYLE','SOUVENIR',359,0,30,94),
('CMR','PAHKAHMAH MIRA DRESS','8852468450895','WOMEN','APPAREL',899,11,15,95),
('CERK','PAHKAHMAH ERIKA SHIRT','8852468450888','UNISEX','APPAREL',842,0,15,96),
('CMND','PAHKAHMAH MONA DRESS','8852468450840','WOMEN','APPAREL',859,20,15,97),
('P098','PAHKAHMAH T - SHIRT','8852468229996','UNISEX','APPAREL',350,0,0,98),
('FBW','PAHKAHMAH กระเป๋าพับเก็บได้ ร่ำรวย','8852468450833','LIFESTYLE','SOUVENIR',349,0,0,99),
('FBV','PAHKAHMAH กระเป๋าพับเก็บได้ มีชัย','8852468450826','LIFESTYLE','SOUVENIR',349,1,0,100),
('FBL','PAHKAHMAH กระเป๋าพับเก็บได้ โชคดี','8852468450819','LIFESTYLE','SOUVENIR',349,0,0,101),
('GS-MP','PAHKAHMAH GIFT SET - POPULAR SET - S','8852468450802','LIFESTYLE','SOUVENIR',799,0,0,102),
('P103','PAHKAHMAH BELLA UV HAT','8852468450697','LIFESTYLE','SOUVENIR',490,0,0,103),
('TN-MTB','PAHKAHMAH TINY MARTHA BAG','8852468450673','LIFESTYLE','SOUVENIR',890,130,30,104),
('Mini-BLD','PAHKAHMAH MINI BELINDA BAG','8852468450680','LIFESTYLE','SOUVENIR',1290,168,30,105),
('P106','PAHKAHMAH BELL ELEPHANT KEY - S','8852468450550','UNISEX','ACCESSORIES',129,0,0,106),
('CMNKP','PAHKAHMAH MONIKA PULS','8852468450543','LIFESTYLE','SOUVENIR',890,0,0,107),
('PTS','PAHKAHMAH T - SHIRT','8852468450536','UNISEX','APPAREL',350,0,0,108),
('CPJMS','PAHKAHMAH ELLIE SET','8852468450529','LIFESTYLE','SOUVENIR',998,0,0,109),
('CMCD','PAHKAHMAH MERCURY','8852468450512','LIFESTYLE','SOUVENIR',749,0,15,110),
('CVND','PAHKAHMAH VENUS','8852468450505','LIFESTYLE','SOUVENIR',790,9,15,111),
('CKRP','PAHKAHMAH KARISH','8852468450499','LIFESTYLE','SOUVENIR',794,0,0,112),
('CJKP','PAHKAHMAH JOCKEY','8852468450482','UNISEX','ACCESSORIES',795,63,15,113),
('P114','PAHKAHMAH ABDO','8852468450475','LIFESTYLE','SOUVENIR',588,0,0,114),
('CHP','PAHKAHMAH HAREM','8852468450468','LIFESTYLE','SOUVENIR',554,0,0,115),
('CANK-PT','PAHKAHMAH ANIKA PANTS','8852468450451','UNISEX','APPAREL',692,0,0,116),
('CSF-PT','PAHKAHMAH SOFIA PANTS','8852468450444','UNISEX','APPAREL',882,0,15,117),
('P118','PAHKAHMAH CHARLOTTE','8852468450437','LIFESTYLE','SOUVENIR',1590,0,0,118),
('CMNK','PAHKAHMAH MONIKA','8852468450420','LIFESTYLE','SOUVENIR',890,81,15,119),
('CANK-SH','PAHKAHMAH ANIKA SHIRT','8852468450413','UNISEX','APPAREL',688,0,0,120),
('CSF-SH','PAHKAHMAH SOFIA SHIRT','8852468450406','UNISEX','APPAREL',595,3,15,121),
('CASP','PAHKAHMAH ASHIRA','8852468450390','LIFESTYLE','SOUVENIR',822,20,15,122),
('CVWS','PAHKAHMAH VANESSA WING','8852468450383','LIFESTYLE','SOUVENIR',892,0,0,123),
('HFP-O','PAHKAHMAH HAND FAN - OCTAGON','8852468450376','LIFESTYLE','SOUVENIR',290,0,0,124),
('HFP-C','PAHKAHMAH HAND FAN - CIRCLE','8852468450369','LIFESTYLE','SOUVENIR',290,0,0,125),
('HFP-EL','PAHKAHMAH HAND FAN - ELEPHANT','8852468450352','LIFESTYLE','SOUVENIR',290,111,20,126),
('EKCP3','PAHKAHMAH ELEPHANT KEYCHAIN PACK 3','8852468450345','UNISEX','ACCESSORIES',215,932,100,127),
('ESDS','PAHKAHMAH STANDING ELEPHANT S','8852468329016','LIFESTYLE','SOUVENIR',198,264,50,128),
('P129','PAHKAHMAH COCK TISSUE HOLDER','8852468228241','LIFESTYLE','SOUVENIR',350,0,0,129),
('P130','PAHKAHMAH HEN TISSUE HOLDER','8852468445235','LIFESTYLE','SOUVENIR',280,0,0,130),
('BBB','PAHKAHMAH BIG BAG','8852468228227','LIFESTYLE','SOUVENIR',450,81,30,131),
('CHB','PAHKAHMAH CHILL BAG','8852468228210','LIFESTYLE','SOUVENIR',390,0,30,132),
('BLD','PAHKAHMAH BELINDA BACKPACK','8852468445136','LIFESTYLE','SOUVENIR',1590,0,0,133),
('BPE','PAHKAHMAH ELLIPSE BACKPACK','8852468445808','LIFESTYLE','SOUVENIR',1190,3,0,134),
('P135','PAHKAHMAH HAYATE BACKPACK','8852468445815','LIFESTYLE','SOUVENIR',890,0,0,135),
('Mini-MJB','PAHKAHMAH MINI MAJESTIC BAG','8852468445228','LIFESTYLE','SOUVENIR',1150,164,30,136),
('MJB','PAHKAHMAH MAJESTIC BAG','8852468445211','LIFESTYLE','SOUVENIR',1290,24,30,137),
('Mini-MTB','PAHKAHMAH MINI MARTHA BAG','8852468445204','LIFESTYLE','SOUVENIR',990,175,30,138),
('MTB','PAHKAHMAH MARTHA BAG','8852468228180','LIFESTYLE','SOUVENIR',1190,131,30,139),
('BAH','PAHKAHMAH BUCKET HAT','8852468228159','LIFESTYLE','SOUVENIR',390,166,30,140),
('P141','PAHKAHMAH PASSPORT CASE','8852468228661','LIFESTYLE','LUGGAGE',340,0,0,141),
('P142','PAHKAHMAH TRAVEL SET','8852468228678','LIFESTYLE','SOUVENIR',290,0,0,142),
('MVB','PAHKAHMAH MOVING BEAR','8852468239636','LIFESTYLE','SOUVENIR',149,0,20,143),
('EKCV','PAHKAHMAH ELEPHANT KEY CHAIN HOLDER','8852468228760','UNISEX','ACCESSORIES',149,46,50,144),
('EMG','PAHKAHMAH ELEPHANT MAGNET','8852468228647','LIFESTYLE','SOUVENIR',95,1356,300,145),
('EML','PAHKAHMAH ELEPHANT MOBILE L','8852468235607','LIFESTYLE','SOUVENIR',290,283,50,146),
('EMO','PAHKAHMAH ELEPHANT MOBILE C','8852468445174','LIFESTYLE','SOUVENIR',290,650,50,147),
('EKCHB','PAHKAHMAH BELL ELEPHANT KEY','8852468445198','UNISEX','ACCESSORIES',169,40,300,148),
('EKCH','PAHKAHMAH ELEPHANT KEY CHAIN','8852468228630','UNISEX','ACCESSORIES',98,7179,500,149),
('MVE','PAHKAHMAH MOVING ELEPHANT KEY','8852468445181','UNISEX','ACCESSORIES',219,168,30,150),
('PPP','PAHKAHMAH PIG PILLOW','8852468228821','LIFESTYLE','LUGGAGE',320,0,0,151),
('PBX','PAHKAHMAH BOXING GLOVE','8852468228234','LIFESTYLE','SOUVENIR',480,0,0,152),
('ENP','PAHKAHMAH ELEPHANT NECK PILLOW','8852468229606','LIFESTYLE','LUGGAGE',490,201,30,153),
('PNP','PAHKAHMAH NECK PILLOW','8852468228166','LIFESTYLE','LUGGAGE',390,1,50,154),
('PKBS','PAHKAHMAH BEAR SIZE S','8852468228685','LIFESTYLE','SOUVENIR',280,0,0,155),
('PKBM','PAHKAHMAH BEAR SIZE M','8852468228739','LIFESTYLE','SOUVENIR',380,0,0,156),
('ELKD','PAHKAHMAH LUCKY ELEPHANT','8852468228791','LIFESTYLE','SOUVENIR',390,2,30,157),
('ENDS','PAHKAHMAH FLYING ELEPHANT S','8852468228128','LIFESTYLE','SOUVENIR',295,24,30,158),
('ENDM','PAHKAHMAH FLYING ELEPHANT M','8852468228746','LIFESTYLE','SOUVENIR',395,23,30,159),
('EBD','PAHKAHMAH ELEPHANT BOXING DOLL','8852468228142','LIFESTYLE','SOUVENIR',550,3,20,160),
('ASF','PAHKAHMAH AROMA SCARF JASMINE','8852468228173','LIFESTYLE','SOUVENIR',340,0,0,161),
('SCG','PAHKAHMAH SCARF GARLAND','8852468445242','LIFESTYLE','SOUVENIR',280,100,50,162),
('SCO','PAHKAHMAH PAKAOMA SCARF','8852468228623','LIFESTYLE','SOUVENIR',220,2256,100,163),
('PKH01','PAHKAHMAH PREMIUM PAKAOMA','8852468228616','LIFESTYLE','SOUVENIR',250,204,100,164),
('PBS-PNM','PAHKAHMAH GIFT SET BASKET - PREMIUM SET','8852468450796','LIFESTYLE','SOUVENIR',1499,0,0,165),
('GS-LPN','PAHKAHMAH GIFT SET BASKET - POPULAR SET','8852468450789','LIFESTYLE','SOUVENIR',899,0,0,166),
('PSF','PAHKAHMAH หมอนผ้าขาวม้าสโนวเฟล็ก','8852468450772','HOME','DECORATION',550,0,0,167),
('PCT','PAHKAHMAH หมอนผ้าขาวม้าต้นคริสมาสต์','8852468450765','HOME','DECORATION',590,0,0,168),
('FBT','PAHKAHMAH Foldable bag - Elephant Tuk Tuk','8852468450758','LIFESTYLE','SOUVENIR',349,69,20,169),
('FBB','PAHKAHMAH Foldable bag - Elephant MuayThai','8852468450741','LIFESTYLE','SOUVENIR',349,163,20,170),
('FBS','PAHKAHMAH Foldable bag - Elephant Sawadee','8852468450734','LIFESTYLE','SOUVENIR',349,130,20,171),
('DUOSET','PAHKAHMAH เซตผ้าขาวม้า+ผ้าพันคอ DUOSET GIFT SET BOX','8852468450727','LIFESTYLE','SOUVENIR',499,0,0,172),
('GSG','PAHKAHMAH พวงมาลัยผ้าพันคอผ้าขาวม้า GIFT SET BOX','8852468450710','LIFESTYLE','SOUVENIR',299,0,0,173),
('GSB','PAHKAHMAH ผ้าพันคอผ้าขาวม้า GIFT SET BOX','8852468450703','LIFESTYLE','SOUVENIR',259,0,0,174),
('EE2DK','PAHKAHMAH ELEPHANT EMBRO 2D KEYCHAIN','8852468452257','LIFESTYLE','SOUVENIR',189,0,30,175),
('CE2DK','PAHKAHMAH CAT EMBRO 2D KEYCHAIN','8852468452264','LIFESTYLE','SOUVENIR',189,9,20,176),
('CLCE','PAHKAHMAH LUCKY CAT EMBRO CHARM','8852468452271','LIFESTYLE','SOUVENIR',295,101,20,177),
('PFPT-S','PAHKAHMAH PUFFY POP TOTE-S','8852468452288','LIFESTYLE','SOUVENIR',395,285,30,178),
('CANK-SHR','PAHKAHMAH ANIKA SHIRT-R','8852468452295','LIFESTYLE','SOUVENIR',850,55,20,179),
('CANK-PTR','PAHKAHMAH ANIKA PANTS-R','8852468452301','LIFESTYLE','SOUVENIR',890,62,20,180),
('CZBS','PAHKAHMAH ZABRINA SLEEVE DRESS','8852468452318','LIFESTYLE','SOUVENIR',1790,23,20,181),
('CER','PAHKAHMAH ELEPHIE RAIN CHARM','8852468452349','LIFESTYLE','SOUVENIR',495,24,20,182),
('CLEGP-R','PAHKAHMAH LUCKY ELEPHANT THAI GARLAND ROUND CHARM','8852468452493','LIFESTYLE','SOUVENIR',350,14,30,183),
('CLEGP-L','PAHKAHMAH LUCKY ELEPHANT THAI GARLAND LONG CHARM','8852468452509','LIFESTYLE','SOUVENIR',290,28,30,184),
('CTCTS','PAHKAHMAH THAICON CROPPED T-SHIRT','8852468452356','LIFESTYLE','SOUVENIR',690,56,20,185),
('CTCS','PAHKAHMAH THAICON T-SHIRT','8852468452363','LIFESTYLE','SOUVENIR',790,0,20,186),
('BJK','PAHKAHMAH BOOK JACKET','8852468452370','LIFESTYLE','SOUVENIR',450,0,20,187),
('CLEGH','PAHKAHMAH PM LUCKY ELEPHANT THAI GARLAND HAIR CHARM','8852468452516','LIFESTYLE','SOUVENIR',390,15,10,188),
('esdxs','ช้างผ้าขาวม้าจิ๋ว ไม่มีห่วง','BC-1793077081723','LIFESTYLE','SOUVENIR',0,500,10,189);
insert into public.contacts (kind, code, entity_type, country, name, address, address2, address3, postcode, tax_id, branch_code, branch_name, contact_name, email, mobile, credit_days, office_phone) values
('supplier',null,'company','TH','555 PAPERPLUS CO.,LTD.',null,null,null,null,null,null,null,null,null,null,0,null),
('customer','A-01-001','company','TH','Absolute World Group (Thailand) Co., Ltd. สาขาที่ 00002','16/132-16/133 Moo 2, Kathu, Kathu, Phuket 83120',null,null,null,'0105556062021','00002',null,null,null,null,0,null),
('customer',null,'company','INTL','Analog Devices International, LLC Singapore Branch','Solaris@Kallang 164','164 Kallang Way','#07-09 Singapore','34924',null,null,'Singapore Branch','Ms.Mei Ing','Mei-Ing.Pua@analog.com','+65 9735 8597',0,null),
('supplier',null,'company','TH','AOMSIN HANDMADE',null,null,null,null,null,null,null,null,null,null,0,null),
('customer',null,'company','TH','BIC EVENT CO.,LTD.','277/181 Moobaan Noble Curve , Pradit Manutham Road, Lat Phrao Subdistrict, Lat Phrao District, Bangkok',null,null,'10230','0105559143838',null,'สำนักงานใหญ่','Khun Nadi Hui',null,null,0,null),
('customer',null,'person','TH','Cash Sale / ขายเงินสด',null,null,null,null,null,null,null,null,null,null,0,null),
('customer',null,'company','INTL','element14 Pte. Ltd.','151 Lorong Chuan #05-02A and 05-03 New Tech Park','Singapore 556741',null,null,null,null,'สำนักงานใหญ่','Ms.Kwan Ann Kay','annkay.kwan@element14.com',null,0,null),
('customer',null,'company','TH','Embassy of the Federal Republic of Germany Bangkok','9 South Sathorn Road, Bangkok 10120',null,null,null,null,null,'สำนักงานใหญ่','Khun Gisela',null,'081-987-6922',0,null),
('supplier',null,'company','TH','Freepik Company, S.L.U.','Calle Molina Lario 13, Planta 5, 29015 Málaga, Spain',null,null,null,null,null,null,null,null,null,0,null),
('customer',null,'company','INTL','HELPORT PTE. LTD.','9 TEMASEK BOULEVARD, #07-00, SUNTEC TOWER TWO, SINGAPORE 038989',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','IMCD (THAILAND) CO.,LTD.','1858/99-100 อาคารอินเตอร์ลิงค์ ทาวเวอร์ บางนา','ชั้น 22 ถนนเทพรัตน แขวงบางนาใต้','เขตบางนา กรุงเทพมหานคร','10260','0105555171128',null,'สำนักงานใหญ่','Sasikan A.',null,'080-425-8844',0,null),
('customer','I-01-001','company','TH','Isuzu Motors International Operations (Thailand) Co., Ltd.','1010 Shinawatra Tower III, 24th-25th Floor, Vibhavadi Rangsit Road,Chatuchak, Bangkok 10900',null,null,null,'0105545030181',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','L-03-001','person','TH','LABORATORIOS HIPRA S.A','Avinguda la Selva ,135 17170 Amer (GIRONA) ESA28063675',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','L-02-001','company','TH','LiuGong Yontrakarn Co., Ltd. สำนักงานใหญ่','102 Moo 1, Khung Lan, Bang Pa-in, Ayutthaya, Thailand 13160',null,null,null,'0145565003546',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','INTL','Macnica Cytech Pte Ltd','19 Tai Seng Ave','#03-01, Singapore 534054',null,null,null,null,'สำนักงานใหญ่','Mr.Effendy Tukimin','effendyt@macnica.com',null,0,'+65 9828 6781'),
('supplier',null,'company','TH','Magnific AI, S.L.U.','Calle Molina Lario 13, Planta 5, 29015 Málaga, Spain',null,null,null,'0993000495004',null,null,null,null,null,0,null),
('customer','O-01-001','company','TH','OHTL Public Company Limited','48 ซอยบรูพา ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0107536001028',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','St. Andrews International School Sathorn','9 Convent Road, Silom','Bangrak Bangkok',null,'10500','0994000772777',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','Tourism Authority of Thailand Singapore Office','372 Orchard Road Singapore 238870',null,null,null,'0994000165277',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','ZENITH CO., LTD.','3 Chome-1-6 Motoazabu,','Minato City, Tokyo, Japan',null,null,'6010401176878',null,'สำนักงานใหญ่',null,'info.zenith.jp@gmail.com',null,0,null),
('customer',null,'company','TH','กรมการขนส่งทางราง','อาคาร ณ ถลาง เลขที่ 514/1 ถนนหลานหลวง','แขวงสี่แยกมหานาค เขตดุสิต กรุงเทพฯ',null,'1030','0994002507701',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','กรมบังคับคดี','189/1 ถนน/แขวงบางขุนนนท์','เขตบางกอกน้อย กรุงเทพฯ','10700',null,'0994000159714',null,null,null,null,null,0,null),
('customer','ก-03-005','person','TH','กรมวิชาการเกษตร','50 ถนนพหลโยธิน แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900',null,null,null,'0994000158921',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','กรมสนธิสัญญาและกฎหมาย','443 ถนนศรีอยุธยา แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400',null,null,null,'0994000160062',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','กรมสรรพากร',null,null,null,null,'0994000158441',null,null,null,null,null,0,null),
('customer','ก-03-002','person','TH','กระทรวงการต่างประเทศ','443 ถ. ศรีอยุธยา แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400',null,null,null,'0994000160062',null,null,null,null,null,0,null),
('customer',null,'company','TH','กองตลาดเอเชียตะวันออก การท่องเที่ยวแห่งประเทศไทย','1600 ถนนเพชรบุรีตัดใหม่ แขวงมักกะสัน เขตราชเทวี กทม 10400',null,null,null,'0994000165277',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','กองทุน สนับสนุนการสร้างเสริมสุขภาพ','99/8 อาคารศูนย์เรียนรู้สุขภาวะ ซอยงามดูพลี แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพมหานคร',null,null,'10120','0994000005377',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-03-003','person','TH','กองทุนสวัสดิการกรม กรมส่งเสริมอุตสาหกรรม','75/6 ถนนพระรามที่ 6 เขตราชเทวี กรุงเทพฯ 10400',null,null,null,'0994000158432',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-03-001','person','TH','การท่องเที่ยวแห่งประเทศไทย','1600 ถนนเพชรบุรีตัดใหม่ แขวงมักกะสัน เขตราชเทวี กทม 10400',null,null,null,'0994000165277',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-03-008','person','TH','การท่องเที่ยวแห่งประเทศไทย (สำนักงานสิงคโปร์)','372 ถนนออร์ชาร์ด สิงคโปร์ 238870',null,null,null,'0994000165277',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-03-004','person','TH','การทางพิเศษแห่งประเทศไทย สา นักงานใหญ่','111 ถนนริมคลองบางกะปิ แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร 10310',null,null,null,'0994000165421',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-03-006','person','TH','การไฟฟ้านครหลวง สำนักงานใหญ่','อาคารวัฒนวิภาส เลขที่ 1192 ถนน พระราม 4 แขวง คลองเตย เขต คลองเตย กทม. 10110',null,null,null,'0994000165200',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-03-007','person','TH','การไฟฟ้าส่วนภูมิภาค สำนักงานใหญ่','200 ถนนงามวงศ์วาน แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900',null,null,null,'0994000165501',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-03-003','person','TH','คณะกายภาพบา บัดและเวชศาสตร์การกีฬา มหาวิทยาลัยรังสิต','52/347 ถนนพหลโยธิน ตำบลหลักหก อำเภอเมือง จังหวัดปทุมธานี 12000',null,null,null,'0994000241241',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-03-001','person','TH','คณะการท่องเที่ยวและการโรงแรม มหาวิทยาลัยธุรกิจบัณฑิตย์','110/1-4 ถนนประชาชื่น เขตหลักสี่ แขวงทุ่งสองห้อง กรุงเทพมหานคร 10210',null,null,null,'0994000179545',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','คณะนิติศาสตร์ มหาวิทยาลัยธรรมศาสตร์','2 ถนนพระจันทร์ แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร','10200',null,null,'0994000160861',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','คณะสถาปัตยกรรมศาสตร์และการผังเมือง มหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต','เลขที่ 99 หมู่ 18 ตำบลคลองหนึ่ง อำเภอคลองหลวง ปทุมธานี',null,null,'12121','0994000160861',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-03-002','person','TH','คณะอักษรศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย สำนักงานใหญ่','ถนนพญาไท เขตปทุมวัน กรุงเทพฯ 10330',null,null,null,'0994000165021',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','คุณ วิระชัย ใบนางแย้ม','98 ถ. พระรามที่ 3 แขวงบางคอแหลม เขตบางคอแหลม กรุงเทพมหานคร 10120',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,'0910646670'),
('customer',null,'company','TH','คุณชาญกิจ สมะลาภา',null,null,null,null,null,null,'สำนักงานใหญ่',null,'chankit@samh.co.th',null,0,null),
('customer','น-03-001','person','TH','คุณนวพร ดุลยสิริวิทย์','ศูนย์วิจัยและพัฒนาการเพาะเลี้ยงสัตว์น้า จืดสระแก้ว 288 ม.8 ต.หนองตะเคียนบอน อ.วัฒนานคร จ.สระแก้ว 27160',null,null,null,'3360600639845',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','จาระวี เมฆหมอก',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','จินดาลักษณ์ ประสานธรรมคุณ',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','ด.ญ. กันตินันท์ ชนะสิทธิ์ยศกุล','239/204 ซ.พุทธมณฑลสาย2ซอย7 แขวงบางแคเหนือ เขตบางแค กทม.',null,null,null,'1102004176307',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','ธนาคาร กรุงเทพ จำกัด (มหาชน)','333 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0107536000374',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','ธนาคารกรุงไทย','10,12,14,16 ถ.เพชรเมือง ต.นาสาร อ.บ้านนาสาร จ.สุราษฎร์ธานี 84120',null,null,null,'0107537000882','00952','บ้านนาสาร',null,null,null,0,null),
('customer','ธ-03-001','person','TH','ธนาคารออมสินเขตศิริราช','87 ถนนพรานนก แขวงศิริราช เขตบางกอกน้อย กรุงเทพฯ 10700',null,null,null,'0994000164891',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier','เชียงใหม่กิ๊ฟช็อป','person','TH','น.ส. กัญญ์ลภัส กฤตนัน',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','น.ส. กุสุมา นุเวที',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. ชลธิชา บ่อหนา',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. ซอลีน๊ะ โต๊ะปี',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. ดวงฤทัย จันทร์ยอด',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. ทราวดี ละเมียดดี',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. ธัญรัศม์ ศิลาพัฒนวัชร์',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. ปภัชญา ยอดศรีทอง',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. พัชนีย์ มูลทองชุน',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. พิชชารัตน์ ฐิติรัฐภานันท์',null,null,null,null,null,null,null,null,null,null,0,null),
('customer',null,'person','TH','น.ส. เพชรรัตน์ โฉมเติม','40 หมู่ที่ 5 ต.ปากแคว อ.เมืองสุโขทัย จ.สุโขทัย',null,null,'64000','3640100689654',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','น.ส. รุ่งทิวา เพ็งแก้ว',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. วราภรณ์ เสพมงคลเล',null,null,null,null,'0735559002163',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','น.ส. สิริวรรณ กลับขัน',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','น.ส. สุภักด์ตา พลไชย',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','นวลหงษ์ ศิลาเชียร',null,null,null,null,'3509901101875',null,null,null,null,null,0,null),
('supplier',null,'person','TH','นาง ชลด กนกสิงห์',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาง ธัชกร เพาะปลูก','18/42 หมู่ 3 ต.หอมเกร็ด อ.สามพราน จ.นครปฐม 73110',null,null,null,'3100501597283',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาง ปนัดดา พรหมชัย','51/4 ม.1 ต.ท้าบเกาะ อ.สามโคก จ.ปทุมธานี 12160',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาง พณณกร บำรุงศรี','75/415 หมู่ 9 ต.ละหาร อ.บางบัวทอง จ.นนทบุรี 11110',null,null,null,'3411800052481',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier','วาวากิ๊ฟช็อป','person','TH','นาง วารุณี ทรงรัตนขจร',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาง สุวรรณา ประสานธรรมคุณ','239/136 ซ.พุทธมณฑลสาย2 ซ.7 แขวงบางแคเหนือ เขตบางแค กทม.',null,null,null,'3101800904871',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาง อัจฉรา','7/190 หมู่บ้านปิยวรารมย์ ซอยไทรน้อย หมู่9 ถนนบางกรวย-ไทรน้อย ตำบลไทรน้อย อำเภอไทรน้อย นนทบุรี',null,null,'11150','3650801030497',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางพัชรี เมดเซ่น',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier','C0001','person','TH','นางสาว กนกวรรณ สิมทะราช','181/45 หมู่ 8 ต.วังกระแจะ อ.เมืองตราด จ.ตราด 23000',null,null,null,'1319800331528',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','นางสาว จันทกาญจน์ สมเสาร์','159 หมู่ที่ 6 ต.ดอนจิก อ.พิบูลมังสาหาร จ.อุบลราชธานี',null,null,null,'1349700076739',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier','A','person','TH','นางสาว จัมทกาญจน์ สมเสาร์','159 หมู่ 6 ต.ดอนจิก อ.พิบูลมังสาหาร จ.อุบลราชธานี 34110',null,null,null,'1349700076739',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว จุฑามาศ ศรีเกตุ','42/618 ม.5 ต.ไร่ขิง อ.สามพราน จ.นครปฐม',null,null,null,'1730601238313',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ชญาพิมพ์ เลิศสีดา','16/15 หมู่ 1 ต.บ้านปึก อ.เมืองชลบุรั จ.ชลบุรี',null,null,null,'3409900898363',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ชณิชา ภูสิษฐ์โชต','127/95 หมู่ 5 ต.โสนลอย อ.บางบัวทอง จ.นนทบุรี 11110',null,null,null,'1100200055221',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ณัฎฐณิชา บุญอุ่น','14 ซ.ลาดพร้าว 41 แขวงจันทรเกษม เขตจตุจักร กรุงเทพมหานคร 10900',null,null,null,'3100502696889',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ณัฏฐณิชา บุญอุ่น',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier','ออมสิน','person','TH','นางสาว ณัฐชยา สิงห์ใจ',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ณิชา ลิ้มไฉไล','1004 ซ.อนามัยงามเจริญ 27 แขวงท่าข้าม เขตบางขุนเทียน กรุงเทพมหานคร',null,null,null,'1101501211240',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ดวงฤทัย จันทร์ยอด','305/143 หมู่ 5 ต.สุรศักดิ์ อ.ศรีราชา จ.ชลบุรี',null,null,null,'1529900011060',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ดาริกา กำเหนิดแก้ว','594/3 ซ.พุทธมณฑลสาย2ซอย7 แขวงบางแคเหนือ เขตบางแค กรุงเทพมหานคร',null,null,null,'1100801472536',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ทราวดี ละเมียดดี','10 หมู่ที่ 16 ต.ตาอ็อง อ.เมืองสุรินทร์ จ.สุรินทร์',null,null,null,'3320100195867',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ธัญญ์ญาณี เอี่ยมศรีอุไร','88/57 ซ.จันทน์ 27 แขวงทุ่งวัดดอน เขตสาทร กรุงเทพมหานคร',null,null,null,'3100901679503',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ธัญรัศม์ ศิลาพัฒนวัชร์','100/660 ซ.เคหะคลองเตอย 4 แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',null,null,null,'3100900860441',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ธันยาภัทร์  บุญเลิศไมตรี','201/426 ซ.พหลโยธิน 54/1 แยก4-12(ม.อรุณนิเวศน์) แขวงคลองถนน เขตสายไหม กทม.',null,null,null,'3101800904863',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว นูรอาซัม สามะ','281/1 หมู่ที่ 12 ต.บูกิต อ.เจาะไอร้อง จ.นราธิวาส',null,null,null,'1969900378237',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ปภัชญา ยอดศรีทอง','54 หมู่ 3 ต.วัดสำโรง อ.นครชัยศรี จ.นครปฐม 73120',null,null,null,'3730300217178',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ปรารถนา แช่มโสภา','65/1 หมู 4 ตำบลดอนเจดีย์ อำเภอดอนเจดีย์ จังหวัดสุพรรณบุรี 72170',null,null,null,'1720600104682',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ฝน แซ่ลี้','59/333 ซ.เพชรเกษม 112 แขวงหนองค้างพลู เขตหนองแขม กทม.',null,null,null,'3100800414369',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว พนอยนภัส สุนทรธรรมรัตน์','127/85 ม.5 ซ.3 ต.โสนลอน อ.บางบัวทอง จ.นนทบุรี 11110',null,null,null,'1103000170976',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว พลอยนภัส สุนทรธรรมรัตน์','127/95 หมู่ 5 ต.โสนลอย อ.บางบัวทอง จ.นนทบุรี',null,null,'11110','1103000170976',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว พัชรี คล้ายบุตร','87 หมู่ 16 ต.ตาอ็อง อ.เมืองสุรินทร์ จ.สุรินทร์ 32000',null,null,null,'3320100205048',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว พาเพลิน พรมจันทร์','73 หมู่ 4 ต.คำไผ่ อ.ไทยเจริญ จ.ยโสธร 35120',null,null,null,'3350800594179',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว แพรวตา เรืองศิลป์','69 ซ.เพชรเกษม 77 แยก 4-1 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร',null,null,null,'1102300102266',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว รุ่งทิวา เพ็งแก้ว','38/1 หมู่ 8 ต.นาเหรง อ.นบพิตำ จ.นครศรีธรรมราช 80160',null,null,null,'1800800135718',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว วรรณวิษา จ่าสุด','34/1 หมู่ 4 ต.ทรายแดง อ.เมืองระนอง จ.ระนอง 85130',null,null,null,'2859900058461',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว วรินยุพา ใจโพธิ์','141 หมู่8 ต.หนองหลัก อ.ไชยวาน จ.อุดรธานี',null,null,null,'1419900624968',null,'สำนักงานใหญ่','นางสาว วรินยุพา ใจโพธิ์',null,'0936179287',0,null),
('supplier',null,'person','TH','นางสาว เวณิกา จริยวิชัย','1343/14 ถ.ชลประทาน (ทรายใต้) ต.ชะอำ อ.ชะอำ จ.เพชรบุรี',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ศรีลัย เพ็ชร์ทศ','55/118 ม.2 ต.ท่าตลาด อ.สามพราน จ.นครปฐม 73110',null,null,null,'3740100660493',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ศิริขวัญ กลับขัน','119 หมู่ 6 ต.บางดี อ.ห้วยยอด จ.ตรัง 92210',null,null,null,'1920600250229',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ศิริพร เครื่องพันธ์','86 ม.11 ต.หนองปรือ อ.บางละมุง จ.ชลบุรี',null,null,null,'3480100177884',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ศิวะพร ชัยทาน','18/42 ม.3 ต.หอมเกร็ด อ.สามพราน จ.นครปฐม',null,null,null,'1102002751703',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว ศุภลักษณ์ เพ็งพิศ','263/12 ถ.ตรังคภูมิ ต.กันตัง อ.กันตัง จ.ตรัง',null,null,null,'1839900470185',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว สิริวรรณ กลับขัน','119 หมู่ 6 ต.บางดี อ.ห้วยยอด จ.ตรัง 92210',null,null,null,'1920600187039',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว สุธาสินี   ปัทมฐิตานนท์','38 ซ.เพชรเกษม 84 แขวงบางแคเหนือ เขตบางแค กรุงเทพมหานคร',null,null,null,'1104000073815',null,'สำนักงานใหญ่',null,null,'097-2156176',0,null),
('supplier',null,'person','TH','นางสาว สุภักดิ์ตา พลไชย',null,null,null,null,'3470100051953',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว สุมนวินีต์ ประสานธรรมคุณ','5/169 ถ.กาญจนาภิเษก แขวงบางบอนใต้ เขตบางบอน กรุงเทพมหานคร',null,null,null,'1100800173756',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว อนัญญา สุขเกษม','200/3 หมู่ 7 หนองหญ้า เมืองกาญจนบุรี กาญจนบุรี 71000',null,null,null,'1719900446862',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาว อารดา เพ็งจันทร์','18 หมู่ 7 ท่าตลาด สามพราน นครปฐม 73110',null,null,null,'1709700132350',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาวชลธิชา บ่อหนา','31 หมู่1 ต.ตลิ่งชัน อ.เหนือคลอง จ.กระบี่',null,null,null,'1810800048203',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาวซอลีฝ๊ะ โส๊ะฝี','69 หมู่ 9 ต.ท่าแพ อ.ท่าแพ จ.สตูล',null,null,null,'1910400052997',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','นางสาวฝน แซ่ลี้','59/333 ซ.เพชรเกษม 112 แขวงหนองค้างพลู เขตหนองแขม กทม.',null,null,null,'3100800414369',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นางสาวศุภลักษณ์ เพ็งพิศ','263/12 ถ.ตรังคภูมิ ต.กันตัง อ.กันตัง จ.ตรัง',null,null,null,'1839900470185',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย กฤษฎา โสมมา','8/541 ซ.อาจณรงค์ 1 แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',null,null,null,'1219900806057',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย โชคชัย ปานอ่วม',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย ธนกฤต เลิศพิเชฐกุลชัย','23 แยก 2 ซ.เพชรเกษม 69 หนองค้างพลู หนองแขม กรุงเทพมหานคร 10160',null,null,null,'1101801225475',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย ธนเมศฐ์ หยุดชม','141 ม.5 ต.โคกสว่าง อ.สำโรง จ.อุบลราชธานี',null,null,null,'3341501193173',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย ธเนษฐ ปานอ่วม',null,null,null,null,'1749900054557',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย นิคม บุญกล้า','21 หมู่ที่3 ต.กระเบื้อง อ.ชุมพลบุรี จ.สุรินทร์',null,null,null,'1320200124230',null,'สำนักงานใหญ่','นายนิคม บุญกล้า',null,null,0,null),
('supplier',null,'person','TH','นาย ปัญญาพล สุดหา','41 หมู่ที่ 1 ต.โขงเจียม อ.โขงเจียม จ.อุบลราชธานี',null,null,null,'3340300004542',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','นาย พีรพงษ์ ชุมพล','100/201 หมู่ที่ 2 ต.แคราย อ.กระทุ่มแบน จ.สมุทรสาคร',null,null,null,'1102002336609',null,'สำนักงานใหญ่','นาย พีรพงษ์ ชุมพล',null,null,0,null),
('supplier',null,'person','TH','นาย พีรพงษ์ ชุมพล','100/201 หมู่ที่ 2 ต.แคราย อ.กระทุ่มแบน จ.สมุทรสาคร',null,null,null,'1102002336609',null,'สำนักงานใหญ่','นาย พีรพงษ์ ชุมพล',null,null,0,null),
('supplier',null,'person','TH','นาย รัตนชัย พุกสุข','41 ซ.21 ต.ในเมือง อ.เมือง จ.กำแพงเพชร 62000',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย ศุภกิจ ปันโน',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย สายัน อินแนน','161 หมู่ 2 ต.บ้านกลาง อ.หล่มสัก จ.เพชรบูรณ์ 67110',null,null,null,'3670300719352',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย สุเทพ หมัดจุ้ย','5 ซ.ทรายทอง 34 ต.ทุ่งทราย อ.เมืองนนทบุรี จ.นนทบุรี',null,null,null,'3120101366454',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นาย สุเมธ ประสานธรรมคุณ','5/169 ถ.กาญจนาภิเษก แขวงบางบอนใต้ เขตบางบอน กรุงเทพมหานคร',null,null,null,'3101500070151',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นายเดชา วรรณพฤกษ','เลขที่ 7 หมู่ที่6 ต.ธงธานี อ.ธวัชบุรี จ.ร้อยเอ็ด',null,null,null,'3450500595519',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier','ช.ช้าง','person','TH','นายไพรัช',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier','นายเมธาวัจน์ ชนะสิทธิ์ยศกุล','person','TH','นายเมธาวัจน์ ชนะสิทธิ์ยศกุล','120/754 หมู่ที่ 9 ต.บางพูด อ.ปากเกล็ด จ.นนทบุรี',null,null,null,'3101500070207',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','นายศุภกร อัชชะ','119/3 หมู่3 ต.สวนหลวง อ.กระทุ่มแบน จ.สมุทรสาคร',null,null,null,'1102300080416',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บจก. โนเบลโปรดักต์แอนด์ เซอร์วิส',null,null,null,null,null,null,null,null,null,null,0,null),
('customer','2-01-001','company','TH','บริษัท 2เอ็นเค เอเจนซี่ จำกัด','179/48,179/49 ถนนนาวงประชาพัฒนา แขวงสีกัน เขตดอนเมือง กทม.10210',null,null,null,'0105562126361',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท 88 คนทัมป้าย จำกัด','227,229,231 หมู่บ้านท่าเกษตรธานี ซอยสุขาภิบาล 1 ถนนบางแค แขวงบางแค เขตบางแค กรุงเทพมหานคร',null,null,'10160','0365563000751',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-01-004','company','TH','บริษัท กรุงเทพดุสิตเวชการ จำกัด (มหาชน) สำนักงานใหญ่','2 ซอย ศูนย์วิจัย 7 ถนนเพชรบุรีตัดใหม่ แขวงบางกะปิ เขตห้วยขวาง กรุงเทพฯ 10310',null,null,null,'0107537000025',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท กรุงไทย-แอกซ่า ประกันชีวิต จำกัด (มหาชน)','9 ชั้น 1,22-27 อาคารจี ทาวเวอร์ แกรนด์ รามา 9 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร',null,null,'10310','0107555000376',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-01-003','company','TH','บริษัท ก่อการดี ๑๑ จำกัด สำนักงานใหญ่','89 หมู่ 8 ต.บ้านม่วง อ.บ้านโป่ ง จ.ราชบุรี 70110',null,null,null,'0125554006263',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท กังวาล โฮลดิ้ง จำกัด','59/1 ซอยสุขุมวิท 39 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0705545000481','00003',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท การะเกด เอ็นเทอร์เทนเม้นท์ จำกัด','302/25 ซอยลาดพร้าว 71 ถนนลาดพร้าว แขวงคลองเจ้าคุณสิงห์ เขตวังทองหลาง กรุงเทพมหานคร',null,null,'10310','0105534006713',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท กู้ด ไวบส์ โซลูชั่น จำกัด','168/30 หมู่บ้าน เชนโทร พระราม 9 - กรุงเทพกรีฑา ถนนพัฒนาชนบท 3 เเขวงคลองสองต้นนุ่น เขตลาดกระบัง กรุงเทพมหานคร 10520',null,null,null,'0105567191927',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท แกรนด์ เลเบิล จำกัด','171 ซอยเจริญรัถ20 ถนนเจริญรัถ แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร',null,null,'10600','0105528001861',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-01-001','company','TH','บริษัท แกรนด์หลานหลวง จำกัด','โรงแรม เบลลา นารา ภูเก็ต ในยาง บีช เลขที่ 55 หมู่ 5 ต.สาคู อ.ถลาง จ.ภูเก็ต 83110',null,null,null,null,'00003',null,null,null,null,0,null),
('supplier','บริษัท โกคอนเน็กซ์ จำกัด','company','TH','บริษัท โกคอนเน็กซ์ จำกัด','61/56 หมู่ที่ 3 ตำบลคลองเกลือ อำเภอปากเกร็ด จ.นนทบุรี',null,null,'11120','0125554001172',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ก-01-002','company','TH','บริษัท โกลเด้น ไทม์ รีแฮบบิลิเทชั่น จำกัด สำนักงานใหญ่','42/4 ซ.รามคา แหง 24 แยก 16 ถนนรามคา แหงแขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ  10240',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท โกลบอล เพาเวอร์ ซินเนอร์ยี่ จำกัด (มหาชน)','555/2 ชั้น 5 อาคารศูนย์เอนเนอร์ยี่คอมเพล็กซ์ อาคารบี ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร',null,null,'10900','0107557000411',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ข้อมูลเครดิตแห่งชาติ จำกัด','100/28-29 ชั้น 18 อาคารสาธรนคร ทาวเวอร์ ถนนสาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105542072801',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-01-006','company','TH','บริษัท ครีเอทีฟ พอยท์ แอด จำกัด สำนักงานใหญ่','9 ซอยบางแวก แขวงบางแวก เขตภาษีเจริญ กรุงเทพมหานคร 10160',null,null,null,'0105543004281',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-01-003','company','TH','บริษัท คอมอาร์ตโปรดักชั่น จำกัด สำนักงานใหญ่','99/203 ถนนเทศบาลสงเคราะห์ แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900',null,null,null,'0105528022249',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-01-002','company','TH','บริษัท คาร์เชอร์ เซ้าท์อีสท์ เอเชีย จำกัด สำนักงานใหญ่','1005 ถนนศรีนครินทร์ แขวงสวนหลวง เขตสวนหลวง กรุงเทพ 10250',null,null,null,'0105553052733',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-01-004','company','TH','บริษัท คิง เพาเวอร์ คอร์ปอเรชั่น จำกัด','119-121 หมู่ที่ 7 ตำบลเปร็ง อำเภอบางบ่อ จังหวัดสมุทรปราการ 10560',null,null,null,'0105565106701','00006',null,null,null,null,0,null),
('customer','ค-01-001','company','TH','บริษัท คิวทีซี เอนเนอร์ยี่ จำกัด (มหาชน) สำนักงานใหญ่','2/2 ซอยกรุงเทพกรีฑา 8 แยก 5 ถนนกรุงเทพกรีฑา แขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ 10240',null,null,null,'0107553000158',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-01-007','company','TH','บริษัท คุ้กกี้ เอเซีย จำกัด สำนักงานใหญ่','51/2 ซอยร่วมฤดี แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร 10330',null,null,null,'0105565157624',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ค-01-005','company','TH','บริษัท เค ทู เอ็กซิบิท จำกัด สำนักงานใหญ่','582 ซอยอยู่เจริญ29 แขวงสามเสนนอก เขตห้วยขวาง กรุงเทพมหานคร 10310',null,null,null,'0105555066901',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เค ไลน์ (ประเทศไทย) จำกัด','33/29-31 ชั้น 8 และเลขที่ 33/32 ชั้นเอ็ม อาคารวอลล์สตรีททาวเวอร์ ถนนสุรวงศ์ แขวงสุริยวงศ์ เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105507002915',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เค เอ โอ เอส แอนเอ็นเตอร์เทนเม้นท์ จำกัด','87 ซอยมีสุวรรณ 3 ถนนสุขุมวิท 71 แขวงพระโขนงเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0105544027322',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท โคนิก้า มินอลต้า บิสสิเนส โซลูชันส์ (ประเทศไทย) จำกัด','33 ซอยรามคำแหง 22 (จิตตรานุเคราะห์) ถนนรามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร',null,null,'10240','0105557032044',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท จงหลี ออโตโมทีฟ (ประเทศไทย) จำกัด','64/190 หมู่4 ตำบลปลวกแดง อำเภอปลวกแดง ระยอง',null,null,'21140','0105568135826',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','จ-01-003','company','TH','บริษัท จอยทูเดอะเวิลด์ จำกัด สำนักงานใหญ่','35/32 ชอยโชคชัยร่วมมิตร แขวงจอมพล เขตจตุจักร 10900',null,null,null,'0105550007435',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท จันทวาปี จำกัด','เลขที่ 223/9 หมู่ 4 ตำบลปากเกร็ด อำเภอปากเกร็ด จังหวัดนนทบุรี',null,null,'11120','0105559124612',null,'สำนักงานใหญ่',null,'Chantawapee@gmail.com','02-194-3545',0,null),
('supplier',null,'company','TH','บริษัท จัมโบ้โฮม จำกัด','417/8 ถนนแสมดำ แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร',null,null,'10150','0105561102507',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','จ-01-002','company','TH','บริษัท จีวอฎัน (ประเทศไทย) จำกัด สำนักงานใหญ่','719 ชั้น 16 และ 25 อาคารเคพีเอ็น ทาวเวอร์ ถนนพระราม 9 แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร 10310',null,null,null,'0105529026078',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','จ-01-001','company','TH','บริษัท จีเอ็มเอ็ม สตูดิโอส์ อินเตอร์เนชั่นแนล จำกัด','50 ถนนสุขุมวิท 21 (อโศก) แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',null,null,null,'0105561157786',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เจพีพี แคร์ จำกัด','เลขที่ 406/1 ซอยสุขุมวิท 68 แขวงบางนาเหนือ เขตบางนา กรุงเทพมหานคร',null,null,'10260','0105551131369',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เจอร์นี่ ทู เอเชีย จำกัด','3761/161-162 ตรอกนอกเขต ถนนเจริญราษฎร์ ซอย 7 แยก 7-3 แขวงบางโคล่ เขตบางคอแหลม กรุงเทพมหานคร',null,null,'10120','0105561011811',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','จ-01-004','company','TH','บริษัท ไจแอนท์ พรีซิชั่น เทค จำกัด สำนักงานใหญ่','111/349 หมู่ที่ 4 ตำบลมาบยางพร อำเภอปลวกแดง จ.ระยอง 21140',null,null,null,'0215567013319',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ชัยพัฒน์ อินเตอร์แพ็ค จำกัด',null,null,null,null,null,null,null,null,null,null,0,null),
('customer','ช-01-001','company','TH','บริษัท ชีวาศรม อินเตอร์เนชั่นแนล เฮลท์ รีสอร์ท จำกัด สำนักงานใหญ่','73/4 ซ.หมู่บ้านหนองแก ถ.เพชรเกษม ต.หัวหิน อ.หัวหิน จ.ประจวบคีรีขันธ์ 7',null,null,null,'0105537120052',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เชฟรอนประเทศไทยสำรวจและผลิต จำกัด','19 ชั้น 5 อาคารไทยพาณิชย์ปาร์คพลาซ่า อาคาร 3 ถนนรัชดาภิเษก แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร',null,null,'10900','0100536023947',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ไชเมคเคอร์ จำกัด','เลขที่ 33/1 ซอย บางกระดี่ 16 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร 10150',null,null,null,'0745547003101',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ซิงค์ ทีเอช จำกัด','253 ชั้น 29 ถนนสุขุมวิท 21 (อโศก) แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0105559157553',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ซ-01-005','company','TH','บริษัท ซิตี้มอลล์ กรุ๊ป จำกัด','622 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',null,null,null,'0105540016253','00002',null,null,null,null,0,null),
('customer','ซ-01-005-2','company','TH','บริษัท ซิตี้มอลล์ กรุ๊ป จำกัด สาขา 00001','689 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',null,null,null,'0105540016253','00001',null,null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ซีคอน ดีเวลลอปเมนท์ จำกัด (มหาชน)','55 ถนนศรีนครินทร์ แขวงหนองบอน เขตประเวศ กรุงเทพมหานคร 10250',null,null,'10250','0107545000012',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ซีคอน บางแค จำกัด (สำนักงานใหญ่)','607 ถนนเพชรเกษม แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',null,null,null,'0105533053882',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ซ-01-003','company','TH','บริษัท ซีพีเอ็น พัทยา จำกัด','333/99 หมู่ 9 ต.หนองปรือ อ.บางละมุง จ.ชลบุรี 20260',null,null,null,'0105556103959','00001',null,null,null,null,0,null),
('customer','ซ-01-006','company','TH','บริษัท ซีพีเอ็น วิลเลจ จำกัด สาขาที่ 00001','98, 98/1 หมู่ที่ 5 ตำบลบางโฉลง อำเภอบางพลี จังหวัดสมุทรปราการ 10540',null,null,null,'0105558153988','00001',null,null,null,null,0,null),
('customer','ซ-01-009','company','TH','บริษัท ซีพีเอ็น เอสเตท จำกัด สาขาที่ 00001','880 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง อำเภอเมืองนครราชสีมา จังหวัดนครราชสีมา 30000',null,null,null,'0105559085668',null,null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท ซีเมนส์ จำกัด','111 ชั้น 6 ยูนิต ยูนิต 601-602 อาคารทรู ดิจิทัล พาร์ค เวสต์ อาคารยูนิคอร์น ถนนสุขุมวิท แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร',null,null,'10260','0105562170751',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ซีแมนทิค ทัช จำกัด','549/9 ซอยสาธุประดิษฐ์ 34 ถนนสาธุประดิษฐ์ แขวงบางโพงพาง เขตยานนาวา กรุงเทพมหานคร',null,null,'10120','0105552066692',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ซ-01-001','company','TH','บริษัท ซีอาร์ ภูเก็ต (ประเทศไทย) จำกัด','177 ถนนราษฏร์อุทิศ 200 ปี ตำบลป่าตอง อำเภอกะทู้ จังหวัดภูเก็ต 83150',null,null,null,'0835538001850','00002',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท ซีเอ็มโอ จำกัด (มหาชน)','4/18-19 ซอยนวลจันทร์ 56 แขวงนวลจันทร์','เขตบึงกุ่ม กรุงเทพฯ',null,'10230','0107546000458',null,'สำนักงานใหญ่',null,null,null,0,'02-088-3888'),
('customer',null,'company','TH','บริษัท เซกิซุย เซ้าท์อีสท์ เอเชีย จำกัด','973 ชั้น 9 ยูนิต 9B,9C,9L,9M อาคารเพรสิเด้นท์ทาวเวอร์ ถนนเพลินจิต แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร',null,null,'10330','0105560126615',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ซ-01-007','company','TH','บริษัท เซ็นทรัล วัตสัน จำกัด สำนักงานใหญ่','3388/23-24 อาคารสิรินรัตน์ ชั้น8 ถนนพระราม 4 แขวงคลองตัน',null,null,null,'0105539086260',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ซ-01-002','company','TH','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน)','4,4/1-4/2,4/4 ถนนราชดำริห์ แขวงปทุมวัน เขตปทุมวัน กทม. 10330',null,null,null,'0107537002443','00008','สาขาเซ็นทรัลเวิลด์',null,null,null,0,null),
('customer','ซ-01-002-5','company','TH','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน) (สาขากระบี่ 00030)','55/5, 55/6, 55/7 ถนนศรีพังงา ตำบลกระบี่ใหญ่ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000',null,null,null,'0107537002443',null,null,null,null,null,0,null),
('customer','ซ-01-002-1','company','TH','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน) (สาขาภูเก็ต  00018)','199 หมู่ที่ 4 ตำบลวิชิต อำเภอเมืองภูเก็ต จังหวัดภูเก็ต 83000',null,null,null,'0107537002443',null,null,null,null,null,0,null),
('customer','ซ-01-002-2','company','TH','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน) (สาขาหาดใหญ่  00011)','1518,1518/1,1518/2 ถนนกาญจนวณิชย์ ต.หาดใหญ่ อ.หาดใหญ่ จ.สงขลา 90110',null,null,null,'0107537002443',null,null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน) สาขากระบี่','55/5, 55/6, 55/7 ถนนศรีพังงา ตำบลกระบี่ใหญ่ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000',null,null,null,'0107537002443','สาขากระบี่ 00030',null,null,null,null,0,null),
('customer','ซ-01-002-3','company','TH','บริษัท เซ็นทรัลพัฒนา จำกัด (มหาชน) สาขาพัทยามารีน่า','78/54 ม.9 ถ.พัทยาสาย2 ต.หนองปรือ อ.บางละมุง จ.ชลบุรี 20260',null,null,null,'0107537002443','00004','สาขาพัทยามารีน่า',null,null,null,0,null),
('customer','ซ-01-004','company','TH','บริษัท เซ็นทรัลพัฒนาเชียงใหม่ จำกัด','9, 9/1 หมูที่ 3 ตำบลสุเทพ อำเภอเมืองเชียงใหม่ จ.เชียงใหม่ 50200',null,null,null,'0505538005467',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ซ-01-002-4','company','TH','บริษัท เซ็นทรัลเวิลด์ จำกัด','209,209/1-209/2 หมู่ 2 ต.บ่อผุด อ.เกาะสมุย จ.สุราษฏร์ธานี 84320',null,null,null,'0105545124364','00006','สาขาสมุย',null,null,null,0,null),
('customer',null,'company','TH','บริษัท โซเด็กซ์โซ่ เซอร์วิสเซส (ประเทศไทย) จำกัด','23/52-54 ชั้น 17 อาคารสรชัย ซอยสุขุมวิท 63 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0105547065896',null,'สำนักงานใหญ่',null,null,null,9,null),
('customer','ซ-01-008','company','TH','บริษัท ไซโก (ประเทศไทย) จำกัด สำนักงานใหญ่','2032 อาคารอิตัลไทย ทาวเวอร์ ชั้นG และ ชั้น2 ถนนเพชรบุรีตัดใหม่ แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร 10310',null,null,null,'0105534097441',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ญ-01-001','company','TH','บริษัท ญาดา ดีเวลลอปเม้นท์ จำกัด สำนักงานใหญ่','59 ซ.สุขุมวิท 16 (สามมิตร) ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กทม.10110',null,null,null,'0105531102291',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-008','company','TH','บริษัท ดอกเตอร์ฟาร์มา เฮลธ์ เทคโนโลยี จำกัด สำนักงานใหญ่','549/1 ถนนสรรพาวุธ แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร 10260',null,null,null,'0105565101467',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ดิงเคิล อินดัสทรี (ไทยแลนด์) จำกัด','328 หมู่6 ตำบลศรีมหาโพธิ อำเภอศรีมหาโพธิ ปราจีนบุรี',null,null,'25140','0105566196259',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ดิน ปริ้นท์ช็อป จำกัด','97/366 ถนนโพธิ์แก้ว แขวงนวมินทร์ เขตบึงกุ่ม กรุงเทพมหานคร',null,null,'10240','0105560126160',null,'สำนักงานใหญ่',null,null,null,7,null),
('customer','ด-01-009','company','TH','บริษัท ดีใจดีไลท์ จำกัด สำนักงานใหญ่','13/2 หมู่ 2 ซอยแบริ่ง 48/1 ถ. สุขุมวิท 107 ต.สา โรงเหนือ อ.เมืองสมุทรปราการ จ.สมุทรปราการ 10270',null,null,null,'0105559119180',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-005','company','TH','บริษัท ดีพีเค อินเตอร์เนชั่นแนล จำกัด สำนักงานใหญ่','99/43 หมู่ 7 ต.โคกขาม อ.เมือง จ.สมุทรสาคร 74000',null,null,null,'0745553003257',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-002','company','TH','บริษัท ดีสโตน คอร์ปอเรชั่น จำกัด (มหาชน)','84 หมู่ที่ 7 ซอยเพชรเกษม 122 ถนนเพชรเกษม ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130',null,null,null,'0107564000375',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-006','company','TH','บริษัท ดุสิตธานี จำกัด (มหาชน) สำนักงานใหญ่','319 อาคารจตุรัสจามจุรี ชั้นที่ 29 ถนนพญาไท แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330',null,null,null,'0107536000617',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ดู๊ด ครีเอชั่น จำกัด','89/315 หมู่บ้านทาวอเวนิวเมิร์จรัตนาธิเบศร์ ซอยวัดมะเดื่อ หมู่7 ตำบลเสาธงหิน อำเภอบางใหญ่ นนทบุรี',null,null,'11140','0125560002576',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-004','company','TH','บริษัท เดอ มอนด์ อนัณดารา จำกัด สา นักงานใหญ่','991 อาคารศูนย์การค้าสยามพารากอน ห้อง 131 ชั้น 1 ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กทม. 10330',null,null,null,'0105548082255',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เดอะ แบล็ค ไท เซอร์วิส จำกัด','408/121 ชั้น 28 อาคารพหลโยธินเพลส ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร',null,null,'10400','0105558006969',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-001','company','TH','บริษัท เดอะ โปร แคนดิท จำกัด สำนักงานใหญ่','76/51 ซ.คุ้มเกล้า 10 ถนนคุ้มเกล้า แขวงแสนแสบ เขตมีนบุรี กทม. 10510',null,null,null,'0105555160207',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-003','company','TH','บริษัท เดอะ ฟู้ดเอ็ดดูเคชั่น แบงคอก จำกัด สำนักงานใหญ่','936 อาคารE โครงการ Block 28 ห้อง E102 ชั้นที่ 1 ซอยจุฬา 7 แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330',null,null,null,'0105564025660',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ด-01-007','company','TH','บริษัท เดอะมอลล์ กรุ๊ป จำกัด สาขาที่ 00005','408,410,412,414,416,418,420,422,424,426,428,430 ถนนงามวงศ์วาน ตำบลบางเขน อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000',null,null,null,'0105523009350','00005',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท โดเทอร์ร่า เอ็นเตอร์ไพรส์ (ประเทศไทย) จำกัด','1788 ชั้น 17 ยูนิต 1709-1711 อาคารสิงห์ คอมเพล็กซ์ ถนนเพชรบุรีตัดใหม่ แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร',null,null,'10310','0105560166536',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ต้าฟาบ๊อกซ์ จำกัด','276 ถนนเฉลิมพระเกียรติ ร.๙4 แขวงหนองบอน เขตประเวศ กรุงเทพมหานคร 10250',null,null,null,'0745563004558',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ท-01-002','company','TH','บริษัท ทริบานาน่า จำกัด สำนักงานใหญ่','58/147 หมู่ที่ 6 ตำบลราไวย์ อำเกอเมือง จังหวัดภูเก็ต 83130',null,null,null,'0835554005155',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ทรู อินเทอร์เน็ต คอร์ปอเรชั่น จำกัด',null,null,null,null,'0105549025026',null,null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท ทวีโชค พาณิช จำกัด','55/5,55/55 ซอยวัดหนามแดง หมู่2 ถนนศรีนครินทร์ ตำบลบางแก้ว อำเภอบางพลี สมุทรปราการ',null,null,'10540','0115547008540',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ท-01-001','company','TH','บริษัท ทเวนตี้โฟร์ ช้อปปิ้ง จำกัด สำนักงานใหญ่','58/28 หมู่ 2 อาคารเดอะธารา ชั้น 12 - 12A ถนนแจ้งวัฒนะ ตำบลบางตลาด อำเภอปากเกร็ด จังหวัดนนทบุรี 11120',null,null,null,'0105557000380',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ทอทรัพย์ เทรดดิ้ง จำกัด',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ทาทา คอนซัลแทนซี เซอร์วิสเซส (ประเทศไทย) จำกัด','1818 ชั้น 17 ยูนิต 1707 อาคารรสา ทู ถนนเพชรบุรี แขวงมักกะสัน เขตราชเทวี กรุงเทพมหานคร',null,null,'10400','0105551050504',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ท-01-004','company','TH','บริษัท ท่าอากาศยานไทย จา กัด (มหาชน) สาขาท่าอากาศยานสุวรรณภูมิ','999 หมู่ 1 ตา บลหนองปรือ อา เภอบางพลี จังหวัดสมุทรปราการ 10540',null,null,null,'0105745000292',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ท่าอากาศยานไทย จำกัด (มหาชน)','333 ถนนเชิดวุฒากาศ แขวงสีกัน เขตดอนเมือง กรุงเทพมหานคร',null,null,'10210','0107545000292',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ที.จี.ไมซ์ จำกัด','351 ซอยวัฒนสุขนิเวศน์','แขวงบางขุนนนท์','เขตบางกอกน้อย กรุงเทพฯ','10700','0125559022038',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ทีฆาซอร์ส จำกัด','1/2 ซอยเพชรเกษม 110 แยก 5 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160',null,null,null,'0105569018602',null,'สำนักงานใหญ่',null,null,null,35,null),
('customer','ท-01-007','company','TH','บริษัท ทีเอชเค ริทึม (ไทยแลนด์) จำกัด สำนักงานใหญ่','300/19 ม.1 ต.ตาสิทธิ์ อ.ปลวกแดง จ.ระยอง 21140',null,null,null,'0215550001886',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ทีเอฟพี อินดัสเตรียล จำกัด','209-211 ถนนเจ้าคำรพ แขวงป้อมปราบ เขตป้อมปราบศัตรูพ่าย กรุงเทพมหานคร',null,null,'10100','0105535146497',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ทีเอสเคที จำกัด','เลขที่ 1/45 หมู่ 5 สวนอุตสาหกรรมโรจนะ ถนนโรจนะ','ตำบลคานหาม อำเภออุทัย จังหวัดพระนครศรีอยุธยา  13210',null,null,'0145544000459',null,'สำนักงานใหญ่',null,null,null,0,'(035) 750-861-6'),
('customer','ท-01-005','company','TH','บริษัท โทรคมนาคมแห่งชาติ จา กัด (มหาชน) สำนักงานแจ้งวัฒนะ สาขา00001','เลขที่ 89/2 ถ.แจ้งวัฒนะ แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพมหานคร 10210',null,null,null,'0107564000014','00001',null,null,null,null,0,null),
('customer','ท-01-006','company','TH','บริษัท ไทย หนานหยาง เอ็นไวรอนเมนเทล โปรเทคชั่น เทคโนโลยี จำกัด','6 ชั้นที่2 ซอยวชิรธรรมสาธิต 55 แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร',null,null,null,'0105567031989',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทยเชื้อเพลิงการบิน จำกัด','99 หมู่10 ตำบลศีรษะจรเข้น้อย อำเภอบางเสาธง สมุทรปราการ',null,null,'10570','0105539130757',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทยไทโย จำกัด','142-145 หมู่18 ตำบลคลองหนึ่ง อำเภอคลองหลวง ปทุมธานี',null,null,'12120','0105528008637',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทยประกันชีวิต จำกัด (มหาชน)','123 อาคารไทยประกันชีวิต 1 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร',null,null,'10400','0107555000104',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทยไพบูลย์ประกันภัย จำกัด (มหาชน)','123 ชั้น 25,26 ยูนิต 2501-2504,2601-2604 อาคารวี.วรรณ ทาวเวอร์ ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร',null,null,'10310','0107555000228',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทยยูเนี่ยน กรุ๊ป จำกัด (มหาชน)','979/12 ชั้นเอ็ม อาคารเอส.เอ็ม.ทาวเวอร์ ถ.พหลโยธิน แขวงพญาไท เขตพญาไท  กรุงเทพมหานคร',null,null,'10400','0107537000891','00001',null,null,null,null,0,null),
('customer','ท-01-003','company','TH','บริษัท ไทยรับประกันภัยต่อ จำกัด (มหาชน) สำนักงานใหญ่','100/3-4 อาคารสาธรนคร ทาวเวอร์ ชั้นที่ 3-4 ถนนสาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0107536001729',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทย-อิชิ อินเตอร์เทรด จำกัด','105/29-30 หมู่10 ตำบลบางครุ อำเภอพระประแดง สมุทรปราการ',null,null,'10130','0115548006893',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไทยเอ็มไอซีอี จำกัด','41 ถนนเทศบาลรังรักษ์ใต้ แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร',null,null,'10900','0105552029452',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ท-01-008','company','TH','บริษัท ไทยเอ็มไอซีอี จำกัด สำนักงานใหญ่','41 ถนนเทศบาลรังรักษ์ใต้ แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900',null,null,null,'0105552029452',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท นันทวัน จำกัด','6 ซอยสุขุมวิท6 แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',null,null,'10110','0105517007014',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท นารา ซีซเท็ม จำกัด','2304 ถนนพัฒนาการ แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร',null,null,'10250','0105530014151',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','น-01-001','company','TH','บริษัท นารายณ์ภัณฑ์ จำกัด','555/5 ซอยสุขุมวิท 63 (เอกมัย) ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กทม.',null,null,null,'0105528011115',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท นิธิ ฟู้ดส์ จำกัด','21/6 หมู่2 ถนนเชียงใหม่-ฮอด ตำบลบ้านกลาง อำเภอสันป่าตอง เชียงใหม่',null,null,'50120','0505541000241',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท นิ่มซี่เส็งขนส่ง 1988 จำกัด',null,null,null,null,null,null,null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท นิสสัน มอเตอร์ เอเชีย แปซิฟิค จำกัด','3 ชั้น 26 และ 27 อาคารรัจนาการ ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพมหานคร',null,null,'10120','0105546059141','00008',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท เน็กซ์ เจน ชอป จำกัด','1768 ชั้น 16 อาคารไทยซัมมิท ทาวเวอร์ ถนนเพชรบุรีตัดใหม่ แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร',null,null,'10310','0105562011033',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','น-01-002','company','TH','บริษัท เน็คเซีย เอเอสวี แอดไวซ์เซอรี่ จำกัด สำนักงานใหญ่','238 อาคารไทยรุ่งเรือง ชั้น 17 ห้องเลขที่ 1704-1705 ถ.นราธิวาสราชนครินท นนทรี เขตยานนาวา กรุงเทพ ฯ 10120',null,null,null,'0105562108304',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บริการเชื้อเพลิงการบินกรุงเทพ จำกัด (มหาชน)','171/2 ถนนกำแพงเพชร 6 แขวงดอนเมือง เขตดอนเมือง กรุงเทพมหานคร',null,null,'10210','0107538000487',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บอนดูบา แอนด์ นิงกิ จำกัด','2521/30-31 หมู่บ้านบิสทาวน์ ถนนลาดพร้าว แขวงคลองเจ้าคุณสิงห์ เขตวังทองหลาง กรุงเทพมหานคร',null,null,'10310','0105553143631',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-008','company','TH','บริษัท บางปะกง ริเวอร์ไซด์ คันทรี่ คลับ จำกัด สาขาที่ 00002','151 หมู่ 5 ตำบลหมูสี อำเภอปากช่อง จังหวัดนครราชสีมา 30450',null,null,null,'0105530030571','00002',null,null,null,null,0,null),
('customer','บ-01-004','company','TH','บริษัท บาสเก็ตเทียร์ (ประเทศไทย) จำกัด สำนักงานใหญ่','893 ถนนพัฒนาการ แขวง สวนหลวง เขต สวนหลวง. กทม 10250',null,null,null,'0105556088216',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-002','company','TH','บริษัท บาห์น สตูดิโอ จำกัด สำนักงานใหญ่','88/87 หมู่ 13 ถ.ราชพฤกษ์ แขวงตลิ่งชัน เขตตลิ่งชัน กรุงเทพมหานคร 10170',null,null,null,'0105555047729',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บิ๊ก ครีเอทีฟ จำกัด','162/45 หมู่6 ตำบลหนองหาร อำเภอสันทราย เชียงใหม่',null,null,'50290','0505559009607',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-003','company','TH','บริษัท บิ๊กชีซูเปอร์เซ็นเตอร์ จำกัด (มหาชน)','88/9 ซอยสมานฉันท์-บาร์โบส แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110',null,null,null,'0107536000633',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท บิ๊กชีซูเปอร์เซ็นเตอร์ จำกัด (มหาชน)','88/9 ซอยสมานฉันท์-บาร์โบส แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110',null,null,null,'0107536000633',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บิลด์ แล็บ เอเชีย จำกัด','11 ซอยจันทน์ 19 แขวงช่องนนทรี เขตยานนาวา กรุงเทพมหานคร',null,null,'10120','0105566132374',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บี ดีเวลลอปเมนท์ (ประเทศไทย) จำกัด','92/37 ชั้น 14 อาคารสาธรธานี 2 ถนนสาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105546047185',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-010','company','TH','บริษัท บี มีเดีย โฟกัส (ประเทศไทย) จำกัด สำนักงานใหญ่','5/38 ซอยงามวงศ์วาน 25 แยก 26 ตำบลบางเขน อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000',null,null,null,'0105549014091',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บี.กริม จอยน์ เว็นเจอร์ โฮลดิ้ง จำกัด','5 ถนนกรุงเทพกรีฑา แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร',null,null,'10240','0105537024313',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-001','company','TH','บริษัท บี.พ้อยท์ มาร์เก็ตติ้ง จำกัด สำนักงานใหญ่','102 ซอยรามคา แหง 24/5 (หมู่บ้านปรีชา) แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร 10240',null,null,null,'0105545047661',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บีแทค อินดัสเตรียล ออโตเมชั่น จำกัด','115 ซอยสุขุมวิท 62/1 ถนนสุขุมวิท แขวงพระโขนงใต้ เขตพระโขนง กรุงเทพมหานคร',null,null,'10260','0105541050170',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-009','company','TH','บริษัท บีบี เอสเตท จำกัด','89 ซอยลาดกระบัง 30 แขวงลาดกระบัง เขตลาดกระบัง กรุงเทพ 10520',null,null,null,'0105561195416',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-005','company','TH','บริษัท บีอีซี - มัลติมีเดีย จำกัด สำนักงานใหญ่','3199 อาคารมาลีนนท์ ทาวเวอร์ ชั้น 4,10 ถนนพระราม 4 แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',null,null,null,'0105543095120',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท บีไอซี อีเว้นท์ จำกัด','เลขที่ 277/181 หมู่บ้านโนเบิล เคิร์ฟ  ถนนประดิษฐ์มนูธรรม แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพมหานคร',null,null,'10230','0105559143838',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-006','company','TH','บริษัท เบสท์ เฟรนด์ กรุ๊ป จำกัด สำนักงานใหญ่','91/1010 ซอยนวลจันทร์ 56 แยก 1 แขวงนวลจันทร์ เขตบึงกุ่ม กรุงเทพมหานคร 10230',null,null,null,'0105558097352',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','บ-01-007','company','TH','บริษัท แบงค์คอก ไรเตอร์ แอนด์ พาร์ทเนอร์ส จำกัด สำนักงานใหญ่','88 ซอยสุขุมวิท 62 แยก 3 แขวงพระโขนงใต้ เขตพระโขนง กรุงเทพมหานคร 10260',null,null,null,'0105557149201',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท แบงค็อค เอ็กซ์ซิบิชั่น เซอร์วิสเซส จำกัด','428 ชั้น 18 อาคารอารีย์ ฮิลล์ ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพมหานคร',null,null,'10400','0105532029465',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ปตท.สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)','555/1 ชั้น 19-36 อาคารศูนย์เอนเนอร์ยี่คอมเพล็กซ์ อาคาร A ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร',null,null,'10900','0107535000206',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ปรินทร จำกัด','88 ถนนเทพรัตน (กม.1) แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร',null,null,'10260','0105527039067',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ป-01-002','company','TH','บริษัท ปิโก (ไทยแลนด์) จำกัด มหาชน สำนักงานใหญ่','10 ซอยลาซาล 56 แขวงบางนาใต้ เขตบางนา กรุงเทพฯ 10260',null,null,null,'0107546000296',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ป-01-001','company','TH','บริษัท เป๊ะมาร์ค จำกัด','55/506 ซอยประเสริฐมนูกิจ 42 ถ.ประเสริฐมนูกิจ แขวงนวมินทร์ เขตบึงกุ่ม กรุงเทพมหานคร 10230',null,null,null,'0105562071079',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ไปรษณีย์ไทย จำกัด',null,null,null,null,'0105546095724',null,null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท แผ่นดินทอง พร็อพเพอร์ตี้ ดีเวลลอปเม้นท์ จำกัด (มหาชน)','2527 ถนนพระรามที่ 4 แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',null,null,'10110','0107537002273','00005',null,null,null,null,0,null),
('customer','พ-01-004','company','TH','บริษัท พญาราชสีห์ จำกัด สำนักงานใหญ่','689 อาคารภิรัชทาวเวอร์ เอ็มควอเทียร์ ชั้น38 ห้อง3804-3806 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กทม. 10110',null,null,null,'0105566238601',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท พรทิพย์สปอร์ตแวร์ จำกัด',null,null,null,null,'0105531036432',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท พรทิพย์สปอร์ตแวร์ จำกัด (Phornthip Sports Wear Co., Ltd.)','264 ซอยบางกระดี่ 25 ถนนบางกระดี่ แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร 10150',null,null,null,null,null,null,null,null,null,0,null),
('customer','พ-01-002','company','TH','บริษัท พังงา โฮเต็ล จำกัด สำนักงานใหญ่','18/8 อาคารฟิโก้เพลส ชั้นที่ 12 ถนนสุขุมวิท 21 (อโศก) แขวงคลองเตยเหนือ กรุงเทพมหานคร 10110',null,null,null,'0105551106241',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท พัฒนาสิน ไทยเทรดดิ้ง จำกัด','51/3 หมู่1 ตำบลบ้านเลื่อม อำเภอเมืองอุดรธานี อุดรธานี',null,null,'41000','0415561000361',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท พัทยา พัฒนา แอสเสท จำกัด','64 หมู่1 ตำบลนาจอมเทียน อำเภอสัตหีบ ชลบุรี',null,null,'20250','0105560063095','00001',null,null,null,null,0,null),
('customer','พ-01-001','company','TH','บริษัท พาราไดซ์ บีช กมลา จำกัด','18/40 หมู่ที่ 6 ตำบลกมลา อำเภอกะทู้ จังหวัดภูเก็ต 83150',null,null,null,'0835532002064',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','พ-01-003','company','TH','บริษัท พี.ซี.อินเตอร์เทรด จำกัด สำนักงานใหญ่','245 ซอยบางนา-ตราด 16 แขวงบางนาใต้ เขตบางนา กรุงเทพมหานคร 10260',null,null,null,'0105535141291',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท พีซี ฟอริช จำกัด','8/215-216 หมู่4 ตำบลท่าตลาด อำเภอสามพราน นครปฐม',null,null,'73110','0735548002973',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท พีบีอาร์ เท็กซ์ไทล์ จำกัด','32/146 หมู่บ้านมณฑล 8 ถนนเลียบคลองทวีวัฒนา แขวงบางแคเหนือ เขตบางแค กรุงเทพมหานคร',null,null,'10160','0105559069948',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท พีบีเอ็ม โซลูชั่น จำกัด','11 ซอยจันทน์ 19 แขวงช่องนนทรี เขตยานนาวา กรุงเทพมหานคร',null,null,'10120','0105566132374',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เพ็ทเลิฟเวอร์ส จำกัด','249 ซอยหมู่บ้านปัญญา ถนนพัฒนาการ แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร',null,null,'10250','0105563170593',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ฟ-01-001','company','TH','บริษัท ฟอสส์ เซาธ์ อีสต์ เอเชีย จำกัด สำนักงานใหญ่','3388 อาคารสิรินรัตน์ ชั้น 25, 26 ห้องเลขที่ 3388/90 ถนนพระราม 4 แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',null,null,null,'0105560113131',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ฟ-01-002','company','TH','บริษัท ฟิวเจอร์เดคคอเรชั่น กรุ๊ป จำกัด สำนักงานใหญ่','311 ซอยลาซาล 46 แขวงบางนาใต้ เขตบางนา กรุงเทพฯ 10260',null,null,null,'0115553006456',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ฟู้ดแลนด์ ซุปเปอร์มาร์เก็ต จำกัด',null,null,null,null,'0107536000374',null,null,null,null,null,0,null),
('customer','ฟ-01-003','company','TH','บริษัท เฟมัส อินฟินิตี้ จำกัด สำนักงานใหญ่','228/46 ถนนร่วมมิตรพัฒนา แขวงท่าแร้ง เขตบางเขน กรุงเทพฯ 10220',null,null,null,'0105555148339',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ฟ-01-004','company','TH','บริษัท เฟรเซอร์ส พร็อพเพอร์ตี้ อินดัสเทรียล (ประเทศไทย) จำกัด','944 มิตรทาวน์ ออฟฟิศ ทาวเวอร์ ชั้นที่ 22-23 ถนนพระราม4 แขวงวังใหม่ เขตปทุมวัน กรุงเทพฯ 10330',null,null,null,'0105548099948',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไฟโบร แอนิมอล เฮลท์ (ประเทศไทย) จำกัด','159/37 ชั้น 23 ยูนิต 2302 อาคารเสริมมิตร ทาวเวอร์ ถนนสุขุมวิท 21 แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0105561046275',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ภ-01-001','company','TH','บริษัท ภักดี รีเทล จำกัด สำนักงานใหญ่','944 มิตรทาวน์ออฟฟิศ ทาวเวอร์ ชั้นที่ 20 ถนนพระราม 4 แขวงวังใหม่ เขตปทุมวัน กรุงเทพมหานคร 10330',null,null,null,'0105562048760',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ม-01-001','company','TH','บริษัท มิตซูบิชิ อีเล็คทริค คอนซูมเมอร์ โปรดักส์ (ประเทศไทย) จำกัด','700/406 หมู่7 ต.ดอนหัวฬอ อ.เมือง จ.ชลบุรี 20000',null,null,null,'0115532003849',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ม-01-002','company','TH','บริษัท มิวส์ จำกัด สำนักงานใหญ่','29/68-71 ซอยลาดพร้าว 23 ถนนลาดพร้าว แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900',null,null,null,'0105544003296',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท มิวส์ เวนเจอร์ส จำกัด','53,53/1,53/2,53/3และ53/4 ซอยสุขุมวิท 39 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0105564143280','00001',null,null,null,null,0,null),
('customer','ม-01-004','company','TH','บริษัท เมอร์ลินบีช จำกัด','99 ถนนหมื่นเงิน ตำบลป่าตอง อำเภอกะทู้ จังหวัดภูเก็ต 83150',null,null,null,'0835540000695','00001',null,'คุณนัท',null,'0649149998',0,null),
('customer','ม-01-003','company','TH','บริษัท เมิร์จ คอมพาเนี่ยน (ประเทศไทย) จำกัด','3300/124 ตึกช้าง อาคาร ปี ชั้น 24 ถนนพหลโยธิน แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900',null,null,null,'0105550043679',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท แม็กเนท มู้ด จำกัด','35/1 ซอยวชิรธรรมสาธิต 51 ถนนสุขุมวิท 101/1 แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร',null,null,'10260','0105559142840',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ม-01-005','company','TH','บริษัท ไมซ์ แมกเนต เอเซีย จำกัด สำนักงานใหญ่','281/19-23 อาคารเดอะเวิร์คลอฟสีลม ชั้น 4 ห้องเลขที่ PO406-PO407 ซอยสีลม ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0105567149262',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ยูเดซี่ คอลเลคชั่น จำกัด','7/6 หมู่5 ตำบลพิมลราช อำเภอบางบัวทอง นนทบุรี',null,null,'11110','0125568000459',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท รัตนมณีการบัญชี จำกัด','50/16 หมู่2 ตำบลท่าตลาด อำเภอสามพราน นครปฐม',null,null,'73110','0735560008323',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท รันนิ่ง คอนเน็ค จำกัด','143/2 ซอยลาดพร้าว 94  (ปัญจมิตร) ถนนลาดพร้าว แขวงพลับพลา เขตวังทองหลาง กรุงเทพมหานคร',null,null,'10310','0105559159505',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ริซิลเลียน  คอลเลคทีฟ จำกัด','723 ชั้น 1 อาคารเตียวฮงสีลม ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105566198405',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท รู้รักสามัคคี วิสาหกิจเพื่อสังคม (ประเทศไทย)  จำกัด','90 ชั้น 1 อาคารซีดับเบิ้ลยู ทาวเวอร์ ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร',null,null,'10310','0105559068178',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ร-01-003','company','TH','บริษัท เรนาสโซ มอเตอร์ จำกัด สำนักงานใหญ่','88 ถ.วิภาวดีรังสิต เเขวงจอมพล เขตจตุจักร กรุงเทพมหานคร 10900',null,null,null,'0105561086404',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ร-01-004','company','TH','บริษัท โรงพยาบาลเปาโล สมุทรปราการ จำกัด สำนักงานใหญ่','123 หมู่ 8 ถ.ศรีนครินทร์ ต.บางเมือง อ.เมือง จ.สมุทรปราการ 10270',null,null,null,'0105535016551',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ร-01-001','company','TH','บริษัท โรบินสัน จำกัด (มหาชน) (สาขาสุขุมวิท)','259 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',null,null,null,'0107536000412','00004',null,null,null,null,0,null),
('customer','ร-01-002','company','TH','บริษัท โรเบิร์ต บ๊อช ออโตโมทีฟ เทคโนโลยีส์ (ประเทศไทย) จำกัด','7/102 หมู่ที่ 4, ถนนทางหลวงหมายเลข 331 นิคมอุตสาหกรรมอมตะซิตี้ ระยอง ตำบลมาบยางพร อำเภอปลวกแดง จังหวัดระยอง 21140',null,null,null,'0215556005883',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ลัคธารา กรุ๊ป จำกัด','127/95 หมู่ที่ 5 ตำบลโสนลอย อำเภอบางบัวทอง จ.นนทบุรี',null,null,'11110','0125561004203',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ลันตา แลนด์ ดีเวลลอปเม้นท์ จำกัด','272 หมู่3 ตำบลศาลาด่าน อำเภอเกาะลันตา กระบี่',null,null,'81150','0105542081125','00003',null,null,null,null,0,null),
('customer','ล-01-001','company','TH','บริษัท ลันตา แลนด์ ดีเวลลอปเม้นท์ จำกัด สาขาที่ 00003','272 หมู่ 3 ต.ศาลาด่าน อ.เกาะลันตา จ.กระบี่ 81150',null,null,null,'0105542081125','00003',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท โลตัส วัลเล่ย์ จำกัด','8-10 ซอย3 ถนนมเหสักข์ แขวงสุริยวงศ์ เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105546129572',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วอนเทค เอเชีย จำกัด','139 ชั้น 19 ยูนิต เอดี อาคารเศรษฐีวรรณ ทาวเวอร์ ถนนปั้น แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105566157806',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วัน แพลนเน็ต พลัส จำกัด','77/314 หมู่ที่ 3 ตำบลคลองพระอุดม อำเภอลาดหลุมแก้ว จ.ปทุมธานี',null,null,'12140','0135563004324',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วัน ออริจิ้น ฮอสพิทัลลิตี้ จำกัด','725 หมู่2 ตำบลอ่าวนาง อำเภอเมืองกระบี่ จังหวัดกระบี่',null,null,'81180','0115565000873','00002',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท วันฟ้าไชโย จำกัด','1/3,1/4 หมู่4 ตำบลท่าตลาด อำเภอสามพราน นครปฐม',null,null,'73110','0735558001694',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วิคตอรี ไจแอนท์ เทคโนโลยี (ประเทศไทย) จำกัด','139/2 หมู่2 ถนนอุดมสรยุทธ์ ตำบลคลองจิก อำเภอบางปะอิน พระนครศรีอยุธยา',null,null,'13160','0135533000771',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ว-01-004','company','TH','บริษัท วิน อินเตอร์ วู้ด จำกัด สำนักงานใหญ่','333 หมู่ 3 ต.พรุพี อ.บ้านนาสาร จ.สุราษฎร์ธานี 84270',null,null,null,'0845546002096',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท วินเซ็นท์ แฟคทอรี่ จำกัด','59/9 หมู่4 ถนนไทรน้อย-วัดต้นเชือก ตำบลบ้านใหม่ อำเภอบางใหญ่ นนทบุรี',null,null,'11140','0105536089152',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ว-01-001','company','TH','บริษัท วินวินสมาย จำกัด สำนักงานใหญ่','55/11 หมู่ 9 ต.ลาดสวาย อ.ลำลูกกา จ.ปทุมธานี 12150',null,null,null,'0135553001373',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วิริยะประกันภัย จำกัด (มหาชน)','927/71 ก ถ.ธนบุรี-ปากท่อ ต.มหาชัย','อ.เมือง จ.สมุทรสาคร',null,'74000','0107555000139','00063','สาขาสมุทรสาคร',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วี.เอ.ริช จำกัด','232 ซอยอินทามระ 45 แขวงรัชดาภิเษก เขตดินแดง กรุงเทพมหานคร',null,null,'10400','0105554140644',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วีรันดา รีสอร์ท จำกัด (มหาชน)','555 ชั้น 27 อาคารรสาทาวเวอร์ ยูนิต 2701-2704 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร',null,null,'10900','0107561000382',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท วี-เอฟ ไล้ท์ติ้ง จำกัด','57 หมู่ที่ 5 ถนนกิ่งแก้ว  ตำบลราชาเทวะ  อำเภอบางพลี จังหวัดสมุทรปราการ',null,null,'10540','0105524015230',null,'สำนักงานใหญ่','Khun Kewalee','kewalee.k@we-ef.com','0849957596',0,null),
('customer',null,'company','TH','บริษัท เวสเทิร์น ดิจิตอล สตอเรจ เทคโนโลยีส์ (ประเทศไทย) จำกัด','140 หมู่2 ถนนอุดมสรยุทธ ตำบลคลองจิก อำเภอบางปะอิน พระนครศรีอยุธยา',null,null,'13160','0145564000608',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ว-01-002','company','TH','บริษัท เวิลด์เด็กซ์ จี.อี.ซี. จำกัด สำนักงานใหญ่','976/16 ซอยโรงพยาบาลพระราม 9 ถนนริมคลองสามเสน แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร 10310',null,null,null,'0105544099005',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ว-01-003','company','TH','บริษัท ไวส์ เอสเตท 20 จำกัด สำนักงานใหญ่','9 ซอยรามอินทรา 5 แยก 23 แขวงอนุสาวรีย์ เขตบางเขน กรุงเทพฯ 10220',null,null,null,'0105566136442',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ศ-01-001','company','TH','บริษัท ศิรินทร์ภัตตาคาร จำกัด สำนักงานใหญ่','1364-68 ถนนพระรามสี่ แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',null,null,null,'0105533075355',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท ศิโร9259 จำกัด','14/490 ซอยรามคำแหง 174 แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร',null,null,'10510','0105561188274',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-01-004','company','TH','บริษัท สตาร์โฮมบีชรีสอร์ท จำกัด สำนักงานใหญ่','59/1 หมู่ 5 ต.คึกคัก อ.ตะกั่วป่า จ.พังงา 82220',null,null,null,'0825546000140',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท สปีดมาร์ค ทรานสปอร์เตชั่น (ประเทศไทย) จำกัด','121/73 ชั้น 23 อาคารอาคารชุด อาร์ เอส ทาวเวอร์ ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร',null,null,'10400','0105544056357',null,'Head Office',null,null,null,1,null),
('customer','ส-01-007','company','TH','บริษัท สปีดมาร์ค ทรานสปอร์เตชั่น (ประเทศไทย) จำกัด สำนักงานใหญ่','121/73 อาคาร อาร์ เอส ทาวเวอร์ ชั้น 23 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพฯ',null,null,null,'0105544056357',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท สยาม จูริส พาร์ทเนอร์ส จำกัด','188 ชั้น 19 ยูนิตที่ 5 อาคารสปริง ทาวเวอร์ ถนนพญาไท แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร',null,null,'10400','0105528031825',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท สยามเจ้าพระยา โฮลดิ้งส์ จำกัด','333 ถนนเจริญนคร แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร',null,null,'10600','0655511000030','00002',null,null,null,null,0,null),
('customer','ส-01-003','company','TH','บริษัท สยามพารากอน รีเทล จำกัด','991/1 ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330',null,null,null,'0105544113032',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-01-001-1','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จา กัด (สาขาป่ าตอง) สาขาที่ 00055','198/9 ถ.ราษฎร์อุทิศ200 ปี ต.ป่ าตอง อ.กะทู้ จ.ภูเก็ต 83150',null,null,null,'0105517005330','00055',null,null,null,null,0,null),
('customer','ส-01-001-2','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด  (สาขาชิดลม)','1027 ถนนเพลินจิต แขวงลุมพินี เขตปทุมวัน กรุงเทพฯ 10330',null,null,null,'0105517005330','00004',null,null,null,null,0,null),
('customer','ส-01-001','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด  (สาขาเซ็นทรัลเวิลด์)','4,4/5 ถนนราชดำริห์ แขวงปทุมวัน เขตปทุมวัน กทม. 10330',null,null,null,'0105517005330','00021',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด  (สาขาปิ่นเกล้า)','7/1 ถนนบรมราชชนนี แขวงอรุณอมรินทร์ เขตบางกอกน้อย กรุงเทพมหานคร',null,null,'10700','0105517005330','00010','สาขาปิ่นเกล้า',null,null,null,0,null),
('customer',null,'company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาบางนา)','585 ถนนเทพรัตน แขวงบางนาเหนือ เขตบางนา กรุงเทพมหานคร',null,null,'10260','0105517005330','00023',null,null,null,null,0,null),
('customer','ส-01-001-7','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาบางรัก)','1522 ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพฯ 10500',null,null,null,'0105517005330','00069',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาป่าตอง)','198/9 ถ.ราษฎร์อุทิศ200 ปี ต.ป่าตอง อ.กะทู้ จ.ภูเก็ต 83150',null,null,null,'0105517005330','00055',null,null,null,null,0,null),
('customer','ส-01-001-6','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาพัทยา)','333/102 หมู่ที่ 9 ต.หนองปรือ อ.บางละมุง จ. ชลบุรี 20260',null,null,null,'0105517005330','00032',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาเมกะบางนา)','39 หมู่6 ตำบลบางแก้ว อำเภอบางพลี สมุทรปราการ',null,null,'10540','0105517005330','00060',null,null,null,null,0,null),
('customer','ส-01-001-8','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขารังสิต) สาขาที่ 00008','94 ถนนพหลโยธิน ตำบลประชาธิปัตย์ อำเภอธัญบุรี จังหวัดปทุมธานี 12130',null,null,null,'0105517005330','00008',null,null,null,null,0,null),
('customer','ส-01-001-3','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาลาดพร้าว) สาขาที่ 00005','1691 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900',null,null,null,'0105517005330','00005',null,null,null,null,0,null),
('customer','ส-01-001-4','company','TH','บริษัท สรรพสินค้าเซ็นทรัล จำกัด (สาขาสมุย)','209/3 หมู่2 ต.บ่อผุด อ.เกาะสมุย จ.สุราษฏร์ธานี 84320',null,null,null,'0105517005330','00045',null,null,null,null,0,null),
('customer','ส-01-001-5','company','TH','บริษัท สรรพสินค้าเซ็นทรัลจำกัด  (สาขาภูเก็ต)','199 หมู่ 5 ตำบลวิชิต อำเภอเมืองภูเภ็ต จังหวัดภูเก็ต 83000',null,null,null,'0105517005330','00028',null,null,null,null,0,null),
('customer','ส-01-009','company','TH','บริษัท สวนลุม พร็อพเพอร์ตี้ จำกัด','86 ถนนพระราม 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0105559131449','00001',null,null,null,null,0,null),
('supplier',null,'company','TH','บริษัท สวนลุม พร็อพเพอร์ตี้ จำกัด','86 ถนนพระรามที่ 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0105559131449','00001',null,null,null,null,0,null),
('customer','ส-01-005','company','TH','บริษัท สวีทล็อค จำกัด สำนักงานใหญ่','100/30-33 อาคารสาธรนครทาวเวอร์ ชั้นที่ 19 ถนนสาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0105567154444',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-01-008','company','TH','บริษัท สหศีนิมา จำกัด','66 ถนนเจริญกรุง แขวงวังบูรพาภิรมย์ เขตพระนคร กรุงเทพฯ 10200',null,null,null,'0105561207431',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-01-002','company','TH','บริษัท สารพัดไทย จำกัด','อาคารพาเหรด ห้องเลขที่ 1301,1335,1336,1337 ชั้นที่ 3 เลขที่ 1877 ถนนพระรามที่ 4 แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร',null,null,'10330','0105558076487','00001',null,null,null,null,0,null),
('customer','ส-01-006','company','TH','บริษัท สุขนิยมทัวร์ จำกัด สำนักงานใหญ่','99/147 หมู่ 2 ต.บางพลับ อ.ปากเกร็ด จ.นนทบุรี 11120',null,null,null,'0125556019745',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เสือติดปีก จำกัด','5 ซอย7 (ถนนเสรี 2) แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร',null,null,'10240','0105553155826',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ห-01-002','company','TH','บริษัท หงเซียง เพาเวอร์ แมชชีนเนอรี่ (ไทยแลนด์) จำกัด สำนักงานใหญ่','700/914 หมู่ที่ 3 ตำบลหนองกะขะ อำเภอพานทอง จ.ชลบุรี 20160',null,null,null,'0205567044192',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ห-01-001','company','TH','บริษัท หัวหิน ชอปปิ้ง คอมเพล็กซ์ จำกัด สำนักงานใหญ่','8/89 ซ.หมู่บ้านหนองแก ต.หนองแก อ.หัวหิน จ.ประจวบคีรีขันธ์ 77110',null,null,null,'0105558018711',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-005','company','TH','บริษัท อมรินทร์ บุ๊ค เซ็นเตอร์ จำกัด','108 หมู่ 2 ถ.บางกรวย-จงถนอม ต.มหาสวัสดิ์ อ.บางกรวย จ.นนทบุรี 11130',null,null,null,'0105536122664',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท อมิโน โอเมก้า จำกัด','40/610 ซอยนวมินทร์ 111 แยก 1 แขวงนวมินทร์ เขตบึงกุ่ม กรุงเทพมหานคร',null,null,'10240','0105566080111',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-012','company','TH','บริษัท ออลอะราวนด์ เดอะเวิลด์ จำกัด สำนักงานใหญ่','18 ซอยพุทธมณฑลสาย 2 ซอย 1 แขวงบางแคเหนือ เขตบางแค กรุงเทพฯ 10160',null,null,null,'0105555099494',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท อันดามัน รีสอร์ท แอสเสท จำกัด','279 หมู่3 ตำบลหนองทะเล อำเภอเมืองกระบี่ กระบี่',null,null,'81180','0105563144711','00001',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท อาศัย โฮลดิ้งส์ จำกัด โรงแรมอาศัย กรุงเทพฯ ไชน่าทาวน์','531 ถนนเจริญกรุง แขวงป้อมปราบ เขตป้อมปราบศัตรูพ่าย กรุงเทพมหานคร 10100',null,null,null,'0105560195170','00002',null,null,null,null,0,null),
('customer','อ-01-006-1','company','TH','บริษัท อาศัย โฮลดิ้งส์ จำกัด โรงแรมอาศัย กรุงเทพฯ ไชน่าทาวน์ สาขาที่ 00002','531 ถนนเจริญกรุง แขวงป้อมปราบ เขตป้อมปราบศัตรูพ่าย กรุงเทพมหานคร 10100',null,null,null,'0105560195170','00002',null,null,null,null,0,null),
('customer','อ-01-006','company','TH','บริษัท อาศัย โฮลดิ้งส์ จำกัด โรงแรมอาศัย กรุงเทพฯ สาทร สาขา 00001','195 ซอยศึกษาวิทยา ถนนสาทรเหนือ แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0105560195170','00001',null,null,null,null,0,null),
('supplier',null,'company','TH','บริษัท อิงกิ ดิจิทัล ปริ้นท์ติ้ง จำกัด','181 หมู่4 ตำบลประตูป่า อำเภอเมืองลำพูน ลำพูน',null,null,'51000','0515566000024',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-009','company','TH','บริษัท อินช์เคป (ประเทศไทย) จำกัด สำนักงานใหญ่','4332 ถนนพระรามที่ 4 แขวงพระโขนง เขตคลองเตย กรุงเทพมหานคร 10110',null,null,null,'0105559077452',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-014','company','TH','บริษัท อินดีด ครีเอชั่น จำกัด','500/61 หมู่ 2 ต.แม่เหียะ อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50110',null,null,null,'0505545004373',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-010','company','TH','บริษัท อินเด็กซ์ ครีเอทีฟ วิลเลจ จำกัด (มหาชน) สำนักงานใหญ่','545 ซอยปรีดีพนมยงค์ 42 ถนนสุขุมวิท 71 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพฯ 10110',null,null,null,'0107547000834',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-011','company','TH','บริษัท อี เอส โกลบอล จำกัด สำนักงานใหญ่','18/155 ถนนราชปรารภ เขตราชเทวี แขวงถนนพญาไท กทม. 10400',null,null,null,'0105531026284',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท อีเวนท์ แทรเวล เอเชีย จำกัด','เลขที่ 3761/161-162 ตรอกนอกเขต','ถนนเจริญราษฎร์ ซอย 7 แยก 7-3 แขวงบางโคล่','เขตบางคอแหลม กรุงเทพมหานคร 10120',null,'0105556054532',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท อีเว้นท์ ไนน์ มาร์เก็ตติ้ง จำกัด','289/15 หมู่13 ตำบลราชาเทวะ อำเภอบางพลี สมุทรปราการ',null,null,'10540','0105550059630',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-008','company','TH','บริษัท อีเอเชีย ทราเวล (ประเทศไทย) จำกัด สำนักงานใหญ่','199 อาคารคอลัมน์ทาวเวอร์ ชั้น 24 ห้อง 2412 ถนนรัชดาภิเษก แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',null,null,null,'0205534001419',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-001','company','TH','บริษัท เอ๊กซคอน จำกัด สำนักงานใหญ่','36 ซอยอินทามระ 18 (วิภาวดีรังสิต 6) ถนนวิภาวดีรังสิต แขวงรัชดาภิเษก เขตดินแดง กรุงเทพฯ 10400',null,null,null,'0105527038966',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เอพีเอ เอสเธติกส์ โกลเบิล จำกัด','199/41-42 ถนนกรุงเทพกรีฑา แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร',null,null,'10240','0105561034447',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-013','company','TH','บริษัท เอ็ม บี เค กระบี่ รีสอร์ท จำกัด','155 หมู่ที่ 2 ต.หนองทะเล อ.เมือง จ.กระบี่ 81180',null,null,null,'0105545109608','00001',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท เอ็ม แอนด์ ซัลลิแวน จำกัด','5 ซอยโชคชัย 4 ซอย 25 ถนนโชคชัย 4 แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพมหานคร',null,null,'10230','0105563043192',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เอ็มดี คอนซูเมอร์ แอพพลายแอนซ์ (ประเทศไทย) จำกัด','555 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร',null,null,'10900','0105563003662',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เอ็มเมอรัลด์ เบย์ รีสอร์ท  จำกัด','88/28,88/30-33 ถนนหมื่นเงิน ตำบลป่าตอง อำเภอกะทู้ ภูเก็ต',null,null,'83150','0105549023333','00001',null,null,null,null,0,null),
('customer',null,'company','TH','บริษัท เอส.เอ็ม.ซี.(ประเทศไทย) จำกัด','134/6 หมู่5 ถนนติวานนท์ ตำบลบางกะดี อำเภอเมืองปทุมธานี ปทุมธานี',null,null,'12000','0105537125772',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เอิร์ธ เท็ค เอนไวรอนเมนท์ จำกัด (มหาชน)','เลขที่ 88,88/1 หมู่ที่ 1 ตำบลบ้านธาตุ อำเภอแก่งคอย จ.สระบุรี',null,null,'18110','0107562000475',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-007','company','TH','บริษัท แอ็คมี่ อินเตอร์เนชั่นแนล (ประเทศไทย) จำกัด','630 ซอยอ่อนนุช 54 แขวงอ่อนนุช เขตสวนหลวง กรุงเทพมหานคร 10250',null,null,null,'0105526049042',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท แองเจิล เรียล เอสเตท คอนซัลแทนซี่ จำกัด','383 ชั้น 2 ยูนิต 201 ซอยศูนย์วิจัย4(พระราม9ซอย13) ถนนพระราม 9 แขวงบางกะปิ เขตห้วยขวาง กรุงเทพมหานคร',null,null,'10310','0105558007990',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-003','company','TH','บริษัท แอนิมอล เฮลท์ (ไทยแลนด์) จำกัด (สำนักงานใหญ่)','33/4 อาคารเดอะไนน์ทาวเวอร์แกรนด์พระราม9 ชั้น30 (ทาวเวอร์บี) ยูนิตTNB04 ถ.พระราม9 แขวงห้วยขวาง เขตห้วยขวาง กทม.10310',null,null,null,'0105558067623',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท แอมเวย์ (ประเทศไทย) จำกัด','1199/1 ถนนรามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร',null,null,'10240','0105528010089',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','บริษัท แอลทีซี ดิจิทัลปรินท์ จำกัด','19 ซอยประชาอุทิศ 79 แยก 9 แขวงทุ่งครุ เขตทุ่งครุ กรุงเทพมหานคร 10140',null,null,null,'0105566128580',null,'สำนักงานใหญ่',null,null,null,30,null),
('supplier',null,'company','TH','บริษัท ไอ เพลย์ ลาเบล จำกัด','3/225 หมู่บ้านมิตรประชา 1 ซอยพหลโยธิน 54/1 แยก4-17 แขวงคลองถนน เขตสายไหม กรุงเทพมหานคร',null,null,'10220','0105561019685',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-004','company','TH','บริษัท ไอคอนสยาม ซิกเนเจอร์ จำกัด','อาคาร ศูนย์การค้าไอคอนสยาม 299 ถนนเจริญนคร แขวงคลองต้นไทร เขตคลองสาน กรุงเทพมหานคร 10600',null,null,null,'0105560029431',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-015','company','TH','บริษัท ไอเด็กซ์ ไมซ์ จำกัด สำนักงานใหญ่','500/60 หมู่ที่ 2 ต.แม่เหียะ อ.เมือง จ.เชียงใหม่ 50100',null,null,null,'0505555007201',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไอเบอร์รี่ โฮมเมด จำกัด','693 ชั้น 6 ยูนิต 6วี06 อาคารศูนย์การค้าเอ็มควอเทียร์ ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0105542098796',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-01-002','company','TH','บริษัท ไอเอ็กซ์แอล จำกัด สำนักงานใหญ่','4 ซอยสุขาภิบาล 2 ซอย 11 แยก 2-3 แขวงประเวศ เขตประเวศ กรุงเทพฯ 10250',null,null,null,'0105542004708',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท ไอเอ็มจี เซอร์วิสเซส (ประเทศไทย) จำกัด','208 ชั้น 3 ยูนิต 304 อาคาร208 แบงค๊อก ถนนวิทยุ แขวงลุมพินี เขตปทุมวัน กรุงเทพมหานคร',null,null,'10330','0105539050541',null,'สำนักงานใหญ่','คุุณเทม',null,'092-261-0680',0,null),
('customer',null,'company','TH','บริษัท ฮายากาว่า อิเล็กทรอนิกส์ (ประเทศไทย)  จำกัด','8/3 หมู่2 ตำบลบางวัว อำเภอบางปะกง ฉะเชิงเทรา',null,null,'24130','0105530042413',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','บริษัท เฮิร์บอะโฮลิก จำกัด','เลขที่ 288/10 ถนนราชปรารภ แขวงถนนพญาไท เชตราชเทวี กรุงเทพมหานคร',null,null,'10400','0105566047253',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ฮ-01-001','company','TH','บริษัท แฮนส์ เมเนจเมนท์ จำกัด สำนักงานใหญ่','998 ถนนวิภาวดีรังสิต แขวงลาดยาว เขตจตุจักร กทม. 10900',null,null,null,'0105533041892',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ฮ-01-002','company','TH','บริษัท ไฮยีน่า เดอะ แอดเวอร์ไทซิง เอเยนซี จำกัด สำนักงานใหญ่','300/2 ซอยลาดพร้าว 84 (สังคมสงเคราะห์ใต้1) แขวงวังทองหลาง เขตวังทองหลาง กรุงเทพมหานคร 10310',null,null,null,'0105544105251',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','พงศธรผ้าไทย','172 ม.10 ต.เมืองเพีย อ.บ้านไผ่ จ.ขอนแก่น 40110',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','พรกิจขนส่ง',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ม-03-002','person','TH','มหาวิทยาลัยเกษตรศาสตร์ สำนักงานใหญ่','50 ถนนงามวงศ์วาน แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900',null,null,null,'0994000159382',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ม-03-003','person','TH','มหาวิทยาลัยธรรมศาสตร์ สำนักงานใหญ่','2 ถนนพระจันทร์ แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพ 10200',null,null,null,'0994000160861',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','มหาวิทยาลัยราชภัฏสวนสุนันทา','เลขที่ 1 ถ.อู่ทองนอก แขวงดุสิต เขตดุสิต กรุงเทพฯ',null,null,'10300','0994000160721',null,'สำนักงานใหญ่','มหาวิทยาลัยราชภัฏสวนสุนันทา',null,null,0,null),
('supplier',null,'person','TH','มิตร ดินสอพอง','31 ถ.เลียบคลองทวีฯ แขวงค้างพลู เขตหนองแขม กรุงเทพฯ 10160',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ม-03-001','person','TH','มูลนิธิอาสาเพื่อนพึ่ง (ภาฯ) ยามยาก สภากาชาดไทย สำนักงานใหญ่','ถนนเพชรบุรี แขวงพญาไท เขตราชเทวี กรุงเทพฯ 10400',null,null,null,'0993000138325',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ย-03-001','person','TH','ยกเลิก',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','ยุพิน หมอนทอง',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','รักษิต โกมลกิตติพงศ์',null,null,null,null,null,null,null,null,null,null,0,null),
('customer','ร-03-001','person','TH','ราชวิทยาลัยวิสัญญีแพทย์แห่งประเทศไทย','อาคารเฉลิมพระบารมี 50 ปี ชั้น 5 เลขที่ 2 ซอยศูนย์วิจัย ถนนเพชรบุรีตัดใหม่ บางกะปิ ห้วยขวาง กรุงเทพฯ 10310',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','ร้าน ธัชสกรีน แอนด์ ดีไซน์ โดยนายจิรายุ ประยูเทพ','18/42 หมู่3 ตำบลหอมเกร็ด อำเภอสามพราน นครปฐม',null,null,'73110','3700200051081',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','ร้านค้าในช้อปปี้ (Shopee)',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','ร้านชะลอมป้าบัวคำเชียงใหม่','80 ม.7 ต.ไชยสถาน อ.สารภี จ.เชียงใหม่ 50140',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','ร้านแพ็คแบ็ค','233-234 ตลาดนัดจตุจักร โครงการ 19 ซอย 7/3 แขวงจตุจักร เขตจตุจักร กทม.',null,null,null,'1101500290197',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','ร้านมนต์ปั้มตรา','298/26 ซ.สารภี 3 ถ.เจริญรัก 1 คลองสาม กทม. 10600',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','ร้านมาวาคิ้งช็อป',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'person','TH','ร้านรัตนชาติ โบ๊เบ๊','1460/5-6 ถ.กรุงเกษม แขวงวัดเทพศิรินทร์ เขตป้อมปราบ กทม.',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','ร้านอัจฉรา พาณิชย์','เลขที่ 7/190 ม.9 ถ.บางกรวย-ไทรน้อย ต.ไทรน้อย อ.ไทรน้อย จ.นนทบุรี',null,null,'11150','3650801030497',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','ร้าย วาวา กิ๊ฟช็อป ตลาดต้นลำใย','ถ.วัชยานนน์ ต.ช้างม่อย อ.เมือง จ.เชียงใหม่ 50300',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','โรงงานทอผ้า กิมกี่','98/1 หมู่ 2 ต.บ้านไร่ อ.เมือง จ.ราชบุรี 70000',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier','คุณเอฟ','company','TH','โรงงานทอผ้ากิมกี่',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','โรงเรียนกว่างเจ้า','525 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0994000172991',null,'สำนักงานใหญ่',null,null,null,0,'02-635-0165'),
('supplier',null,'person','TH','ลาเทนด้า เฮ้าส์','475/15 ถนนทหารบก ตำบลบ่อพลับ อำเภอเมืองนครปฐม จังหวัดนครปฐม 73000',null,null,null,'3759900078142',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','ลาลามูฟ (Lalamove)',null,null,null,null,null,null,null,null,null,null,0,null),
('customer',null,'company','TH','วิทยาลัยนานาชาติ มหาวิทยาลัยมหิดล','999  ถนนพุทธมณฑลสาย 4 ตำบลศาลายา อำเภอพุทธมณฑล จังหวัดนครปฐม 73170','Tel. 02 700 5000',null,'73170','0994000158378',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','วิสาหกิจชุมชนกลุ่มท่อผ้ามัดหมี่และหมอนขิดบ้านด่านเหนือ','116 ม.2 ต.โพนงาม อ.กมลาไสย จ.กาฬสินธุ์ 46130',null,null,null,'4603000153033',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','ศิริราชมูลนิธิ (สาขาวิชาหทัยวิทยา ภ.อายุรศาสตร์)','อาคารศูนย์โรคหัวใจฯ ชั้น 9','เลขที่ 2 ถ.วังหลัง ศิริราช บางกอกน้อย','กรุงเทพฯ','1070','0993000396944',null,'สำนักงานใหญ่','คุณหนิง',null,'0891335532',0,null),
('customer',null,'company','TH','ศูนย์ความเป็นเลิศด้านเทคโนโลยีปิโตรเคมีและวัสดุ','ชั้น 7 ห้อง 705/1 อาคารวิจัยจุฬาลงกรณ์มหาวิทยาลัย','จุฬาลงกรณ์มหาวิทยาลัย ซ.จุฬาฯ 12 ถ.พญาไท','แขวงวังใหม่ เขตปทุมวัน กรุงเทพฯ','10330','0994001016909',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-03-002','person','TH','สถานกงสุลใหญ่ ณ นครซีอาน สำนักงานใหญ่','Room 104, 1st Floor, Building A, China Railway First International,Road, Beilin District, Xi‘an City, Shaanxi Province, China',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','สถานเอกอัครราชทูต ณ กรุงปักกิ่ง','เลขที่ 21 ถนนกวงหวา เขตฉาวหยาง กรุงปักกิ่ง รหัสไปรษณีย์: 100600',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-03-004','person','TH','สถานเอกอัครราชทูต ณ กรุงปักกิ่ง สำนักงานใหญ่','21 ถนนกวงหวา เขตฉาวหยาง กรุงปักกิ่ง รหัสไปรษณีย์ 100600',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-03-005','person','TH','สถาบันคุ้มครองเงินฝาก สำนักงานใหญ่','อาคารเอสเจ อินฟินิท วัน บิสซิเนสคอมเพล็กซ์ ชั้น 25-27 349 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900',null,null,null,'0994000674821',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','สถาบันเทคโนโลยีไทย–ญี่ปุ่น','1771/1 ถ.พัฒนาการ แขวงสวนหลวง','เขตสวนหลวง กรุงเทพฯ 10250',null,null,'0994000627955',null,'สำนักงานใหญ่',null,null,'02-763-2600',0,null),
('customer',null,'person','TH','สมาคม การออกแบบบรรจุภัณฑ์ไทย','999 ซอยนวมินทร์ 113 แขวงนวลจันทร์ เขตบึงกุ่ม กรุงเทพมหานคร',null,null,'10230','0993000360907',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','สมาคม การออกแบบบรรจุภัณฑ์ไทย','999 ซอยนวมินทร์ 113 แขวงนวลจันทร์ เขตบึงกุ่ม กรุงเทพมหานคร',null,null,'10230','0993000360907',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','สมาคม ของขวัญ ของชำร่วยไทยและของตกแต่งบ้าน','87/138 ชั้น 18 อาคารโมเดอร์น ทาว์น ซอยเอกมัย 3 ถนนสุขุมวิท 63 แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร',null,null,'10110','0109543000114',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','สมาคม ประกันชีวิตไทย','36/1 ซอยสะพานคู่ ถนนพระรามที่ 4 แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพมหานคร',null,null,'10120','0109510000140',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','สมาคมของขวัญ ของชําร่วยไทยและของตกแต่งบ้าน','319 อาคารจัตุรัสจามจุรี ชั้น 24 ห้อง ทีที 28 ถนนพญาไท แขวงปทุุมวัน เขตปทุุมวัน กทม. 10330',null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-03-003','person','TH','สมาคมตัวแทนประกันชีวิตและที่ปรึกษาการเงิน สำนักงานใหญ่','138/32 อาคารจูเวลเลอรี่ เซ็นเตอร์ ชั้น 12 ถนนนเรศ แขวงสี่พระยา เขตบางรัก กรุงเทพมหานคร 10500',null,null,null,'0109511000101',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','ส่วนราชการ  สำนักงานเทศบาลเมืองบางแก้ว','99  หมู่  8  ตำบลบางแก้ว  อำเภอบางพลี  จังหวัดสมุทรปราการ',null,null,'10540','0994000279191',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','สำนักงาน ส่งเสริมการจัดประชุมและนิทรรศการ(องค์การมหาชน)','989 ชั้น 25,26 ยูนิต A2,B1,B2 อาคารสยามพิวรรธน์ทาวเวอร์ ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร',null,null,'10330','0994000112165',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','สำนักงาน ส่งเสริมการจัดประชุมและนิทรรศการ(องค์การมหาชน)','989 ชั้น 25,26 ยูนิต A2,B1,B2 อาคารสยามพิวรรธน์ทาวเวอร์ ถนนพระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร',null,null,'10330','0994000112165',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'person','TH','สำนักงาน ส่งเสริมเศรษฐกิจสร้างสรรค์ (องค์การมหาชน)','1160 อาคารไปรษณีย์กลาง ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพมหานคร',null,null,'10500','0994002403264',null,'สำนักงานใหญ่',null,null,null,29,null),
('customer','ส-03-007','person','TH','สำนักงานการวิจัยแห่งชาติ สำนักงานใหญ่','196 ถนนพหลโยธิน แขวงลาดยาว เขตจตุจักร กทม.10900',null,null,null,'0994000159951',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','สำนักงานพาณิชย์จังหวัดนครปฐม','เลขที่ 99 ม.6 ถ.ศูนย์ราชการ ต.ถนนขาด อ.เมือง จ.นครปฐม',null,null,'73000',null,null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','สำนักงานเศรษฐกิจการคลัง กระทรวงการคลัง','ถนนพระรามที่ 6 แขวงพญาไท เขตพญาไท กรุงเทพฯ 10400',null,null,null,'0994000160224',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer',null,'company','TH','สำนักงานส่งเสริมเศรษฐกิจสร้างสรรค์ (องค์การมหาชน)','อาคารไปรษณีย์กลาง ชั้น 2 เลขที่ 1160 ถนนเจริญกรุง','แขวงบางรัก เขตบางรัก กรุงเทพฯ 10500',null,null,null,null,'สำนักงานใหญ่','คุณอารญา',null,'092-394-0303',0,null),
('customer','ส-03-006','person','TH','สำนักงานสภานโยบายการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรมแห่งชาติ','319 อาคารจัตุรัสจามจุรี ชั้น 14 ถนนพญาไท แขวงปทุมวัน เขตปทุมวัน กทม. 10330',null,null,null,'0994000690461',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','ส-03-001','person','TH','สำนักบริหารการศึกษา มหาวิทยาลัยเกษตรศาสตร์ สำนักงานใหญ่','50 แขวงลาดยาว เขตจตุจักร กรุงเทพ 10900',null,null,null,'0994000159382',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','สิริเทรดดิ้ง',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','ห้างหุ้นส่วนจำกัด เจ พี ออดิทติ้ง แอนด์ ลอว์','10/209 ถนนฉลองกรุง แขวงทับยาว เขตลาดกระบัง กรุงเทพมหานคร',null,null,null,'0103556051027',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','ห้างหุ้นส่วนจำกัด ดิโล โปรดักส์',null,null,null,null,null,null,null,null,null,null,0,null),
('supplier',null,'company','TH','ห้างหุ้นส่วนจำกัด ลีลา เอ็มบรอยเดอรี่(สำนักงานใหญ่)','212/15-16 ถนนอินทรพิทักษ์ แขวงหิรัญรูจี เขตธนบุรี กรุงเทพมหานคร',null,null,'10600','0103536029832',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-02-001','company','TH','ห้างหุ้นส่วนจำกัด เอ็น.แอล.ซัพพลาย แอนด์ อีควิปเม้นท์ สำนักงานใหญ่','797/73 ซอยสุทธิพร ถนนประชาสงเคราะห์ แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400',null,null,null,'0103530003289',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-03-003','person','TH','องค์การกองทุนสัตว์ป่าโลกสากล (สำนักงานประเทศไทย) สำนักงานใหญ่','อาคารพิสิษฐ์ บิลดิ้ง 9 ซอยประดิพัทธ์ 10 (ประชานิมิตร) ถนนประดิพัทธ์ แขวงพญาไท เขตพญาไท กรุงเทพมหานคร 10400',null,null,null,'0994000685084',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-03-002','person','TH','องค์การพิพิธภัณฑ์วิทยาศาสตร์แห่งชาติ','39 หมู่ 3 ต.คลองห้า อ.คลองหลวง จ.ปทุมธานี 12120',null,null,null,'0994000166052',null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'company','TH','องุ่นผ้าไทย',null,null,null,null,null,null,'สำนักงานใหญ่',null,null,null,0,null),
('supplier',null,'person','TH','อัจฉราพาณิชย์','7/190 ม.9 ต.ไทรน้อย อ.ไทรน้อย จ.นนทนุรี 11150',null,null,null,'3650801030497',null,'สำนักงานใหญ่',null,null,null,0,null),
('customer','อ-03-001','person','TH','อุตสาหกรรมพัฒนามูลนิธิ สถาบันพัฒนาอุตสาหกรรมสิ่งทอ','อาคารอำนวยการส่วนอุตสาหกรรมสิ่งทอ ซ.ตรีมิตร ถ.พระราม 4 แขวงพระโขนง เขตคลองเตย กรุงเทพฯ 10110',null,null,null,'0994000005563','00002',null,null,null,null,0,null);

-- opening balances as movements so history starts from day one
insert into public.stock_movements (product_id, movement_type, qty, balance_after, note)
select id, 'opening', stock_qty, stock_qty, 'ยอดยกมาจากระบบเดิม 6 พ.ย. 2569' from public.products where stock_qty > 0;
