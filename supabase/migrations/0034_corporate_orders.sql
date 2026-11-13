-- =====================================================================
-- PKM ERP — 0034: ออเดอร์ลูกค้า Corporate (ห้อง OPERATION)
--   สถานะ 2 แกน: งาน (status) + เงิน (pay_status) · เลขเอกสาร QT/ใบแจ้งหนี้/IV/DR/ใบส่งของชั่วคราว
--   ส่งแบ่งรอบ (shipments) · ไฟล์แนบ · ประวัติการเปลี่ยนแปลง (log)
--   เห็น/แก้: สมาชิกห้อง OPERATION + หัวหน้าห้องหลัก SW + ผู้บริหาร · ลบ: หัวหน้า/ผู้บริหาร
--   มูลค่า = ยอดรวม VAT (ที่ลูกค้าจ่ายจริง)
-- =====================================================================
create table if not exists public.corp_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            text not null unique,
  customer_name       text not null,                 -- ชื่อมาตรฐาน (ใช้รวมยอดตามลูกค้า)
  customer_label      text,                          -- ชื่อที่แสดง เช่น "Marriott Lot 3.1"
  contact_id          uuid references public.contacts(id) on delete set null,
  contact_person      text,
  contact_phone       text,
  title               text not null,                 -- รายการสินค้า
  detail              text,                          -- รายละเอียดสินค้า / packaging
  amount              numeric(14,2) not null default 0,   -- รวม VAT
  order_date          date not null default (now() at time zone 'Asia/Bangkok')::date,
  supplier_due        date,                          -- กำหนดรับของจากซัพ/ผู้ผลิต
  due_date            date,                          -- กำหนดส่งลูกค้า
  status              text not null default 'confirm' check (status in ('confirm', 'producing', 'ready', 'partial', 'delivered', 'cancelled')),
  pay_status          text not null default 'none'    check (pay_status in ('none', 'deposit', 'awaiting', 'paid')),
  doc_qt              text,
  doc_bill            text,                          -- ใบแจ้งหนี้
  doc_iv              text,                          -- ใบกำกับภาษี
  doc_dr              text,                          -- ใบเสร็จรับเงิน
  doc_cn              text,                          -- ใบส่งของชั่วคราว
  docs_original_sent  boolean not null default false,
  owner_id            uuid references public.employees(id) on delete set null,   -- ผู้ดูแลออเดอร์
  note                text,
  delivered_at        date,
  created_by          uuid references public.app_users(id) default public.current_app_user_id(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists corp_orders_status on public.corp_orders (status, due_date);
create index if not exists corp_orders_customer on public.corp_orders (customer_name);

create table if not exists public.corp_order_shipments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.corp_orders(id) on delete cascade,
  ship_date  date not null,
  qty_note   text not null,                          -- เช่น "100 ชิ้น"
  note       text,
  created_by uuid references public.app_users(id) default public.current_app_user_id(),
  created_at timestamptz not null default now()
);
create table if not exists public.corp_order_files (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.corp_orders(id) on delete cascade,
  url        text not null,
  name       text,
  is_image   boolean not null default false,
  created_by uuid references public.app_users(id) default public.current_app_user_id(),
  created_at timestamptz not null default now()
);
create table if not exists public.corp_order_log (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.corp_orders(id) on delete cascade,
  at         timestamptz not null default now(),
  by_user    uuid references public.app_users(id) default public.current_app_user_id(),
  message    text not null
);
create index if not exists corp_order_log_order on public.corp_order_log (order_id, at desc);

-- ---------------------------------------------------------------------
create or replace function public.corp_room_id() returns uuid
language sql stable security definer set search_path = public as $$ select id from public.work_rooms where key = 'operation'; $$;
create or replace function public.can_corp() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_room_member(public.corp_room_id()); $$;
create or replace function public.can_corp_delete() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_admin() or public.is_room_lead(public.corp_room_id()); $$;

create or replace function public.next_corp_order_no() returns text
language sql volatile security definer set search_path = public as $$
  select 'ORD-' || lpad((coalesce(max(nullif(regexp_replace(order_no, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0') from public.corp_orders;
$$;
grant execute on function public.next_corp_order_no() to authenticated;

-- ประวัติอัตโนมัติ + updated_at + วันที่ส่งครบ
create or replace function public.corp_order_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare st jsonb := '{"confirm":"รอคอนเฟิร์ม","producing":"สั่งผลิต","ready":"ผลิตเสร็จ/รอส่ง","partial":"ส่งบางส่วน","delivered":"ส่งครบแล้ว","cancelled":"ยกเลิก"}';
        py jsonb := '{"none":"ยังไม่มัดจำ","deposit":"มัดจำแล้ว","awaiting":"ส่งของแล้ว รอชำระ","paid":"จ่ายครบ"}';
begin
  if tg_op = 'INSERT' then
    insert into public.corp_order_log (order_id, message) values (new.id, 'สร้างออเดอร์');
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.corp_order_log (order_id, message) values (new.id, 'สถานะงาน: ' || (st->>old.status) || ' → ' || (st->>new.status));
  end if;
  if new.pay_status is distinct from old.pay_status then
    insert into public.corp_order_log (order_id, message) values (new.id, 'สถานะเงิน: ' || (py->>old.pay_status) || ' → ' || (py->>new.pay_status));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.corp_order_log (order_id, message) values (new.id, 'เปลี่ยนกำหนดส่ง: ' || coalesce(to_char(old.due_date, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(new.due_date, 'DD/MM/YYYY'), '—'));
  end if;
  if new.amount is distinct from old.amount then
    insert into public.corp_order_log (order_id, message) values (new.id, 'เปลี่ยนมูลค่า: ' || to_char(old.amount, 'FM999,999,990.00') || ' → ' || to_char(new.amount, 'FM999,999,990.00'));
  end if;
  return null;
end $$;
drop trigger if exists corp_order_audit on public.corp_orders;
create trigger corp_order_audit after insert or update on public.corp_orders for each row execute function public.corp_order_audit();

create or replace function public.corp_order_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'delivered' and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then new.delivered_at := coalesce(new.delivered_at, (now() at time zone 'Asia/Bangkok')::date); end if;
  if new.status <> 'delivered' then new.delivered_at := null; end if;
  return new;
end $$;
drop trigger if exists corp_order_touch on public.corp_orders;
create trigger corp_order_touch before insert or update on public.corp_orders for each row execute function public.corp_order_touch();

-- ---------------------------------------------------------------------
alter table public.corp_orders enable row level security;
alter table public.corp_order_shipments enable row level security;
alter table public.corp_order_files enable row level security;
alter table public.corp_order_log enable row level security;

create policy "corp read"   on public.corp_orders for select to authenticated using (public.can_corp());
create policy "corp insert" on public.corp_orders for insert to authenticated with check (public.can_corp());
create policy "corp update" on public.corp_orders for update to authenticated using (public.can_corp()) with check (public.can_corp());
create policy "corp delete" on public.corp_orders for delete to authenticated using (public.can_corp_delete());

create policy "corp ship read"   on public.corp_order_shipments for select to authenticated using (public.can_corp());
create policy "corp ship insert" on public.corp_order_shipments for insert to authenticated with check (public.can_corp());
create policy "corp ship delete" on public.corp_order_shipments for delete to authenticated using (public.can_corp_delete() or created_by = public.current_app_user_id());

create policy "corp files read"   on public.corp_order_files for select to authenticated using (public.can_corp());
create policy "corp files insert" on public.corp_order_files for insert to authenticated with check (public.can_corp());
create policy "corp files delete" on public.corp_order_files for delete to authenticated using (public.can_corp_delete() or created_by = public.current_app_user_id());

create policy "corp log read"   on public.corp_order_log for select to authenticated using (public.can_corp());
create policy "corp log insert" on public.corp_order_log for insert to authenticated with check (public.can_corp());

-- ---------------------------------------------------------------------
-- Claude connector (อ่านอย่างเดียว) — ออเดอร์ Corporate
create or replace function public.claude_corp_orders(p_token text, p_open_only boolean default true, p_customer text default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.claude_ok(p_token);
  return coalesce((select jsonb_agg(x order by x->>'due_date' nulls last) from (
    select jsonb_build_object('order_no', o.order_no, 'customer', coalesce(o.customer_label, o.customer_name), 'title', o.title, 'detail', o.detail,
      'amount_incl_vat', o.amount, 'order_date', o.order_date, 'supplier_due', o.supplier_due, 'due_date', o.due_date,
      'status', o.status, 'pay_status', o.pay_status, 'overdue', (o.due_date < (now() at time zone 'Asia/Bangkok')::date and o.status not in ('delivered', 'cancelled')),
      'docs', jsonb_strip_nulls(jsonb_build_object('qt', o.doc_qt, 'bill', o.doc_bill, 'iv', o.doc_iv, 'dr', o.doc_dr, 'cn', o.doc_cn)), 'docs_original_sent', o.docs_original_sent,
      'owner', (select coalesce(e.nickname, e.first_name) from public.employees e where e.id = o.owner_id), 'note', o.note,
      'shipments', (select jsonb_agg(jsonb_build_object('date', s.ship_date, 'qty', s.qty_note) order by s.ship_date) from public.corp_order_shipments s where s.order_id = o.id)) as x
    from public.corp_orders o
    where (not p_open_only or o.status not in ('delivered', 'cancelled') or o.pay_status <> 'paid')
      and (p_customer is null or o.customer_name ilike '%' || p_customer || '%' or o.customer_label ilike '%' || p_customer || '%')
    order by o.due_date nulls last limit greatest(1, least(p_limit, 500))) t), '[]'::jsonb);
end $$;
grant execute on function public.claude_corp_orders(text, boolean, text, int) to anon, authenticated;
