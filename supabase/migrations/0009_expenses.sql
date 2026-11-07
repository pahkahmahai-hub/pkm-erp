-- =====================================================================
-- PKM ERP — 0009: ค่าใช้จ่าย / เจ้าหนี้ / หัก ณ ที่จ่าย
--   • บันทึกบิลซัพพลายเออร์ (อัปโหลดรูป → AI อ่าน → คนตรวจ → บันทึก)
--   • VAT ซื้อ, หัก ณ ที่จ่าย (WHT) + ออกหนังสือรับรอง 50 ทวิ
--   • อนุมัติได้เฉพาะ admin (เจ้าของ + ภรรยา) → รอบจ่าย 1 / 15 → จ่ายแล้ว
--   • พนักงานเห็นเฉพาะบิลที่ตัวเองบันทึก, admin เห็นทั้งหมด
-- =====================================================================

create type public.expense_status as enum ('draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled');
create type public.wht_form as enum ('pnd3', 'pnd53');   -- ภ.ง.ด.3 บุคคลธรรมดา / ภ.ง.ด.53 นิติบุคคล

-- หมวดค่าใช้จ่าย (แก้ได้ในหน้าตั้งค่า)
create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  wht_pct     numeric(5,2) not null default 0,      -- อัตราหัก ณ ที่จ่ายปกติของหมวดนี้
  wht_income_type text,                            -- ประเภทเงินได้บน 50 ทวิ เช่น ค่าจ้างทำของ ม.40(8)
  sort_order  int not null default 100,
  is_active   boolean not null default true
);
insert into public.expense_categories (code, name, wht_pct, wht_income_type, sort_order) values
  ('material',   'วัตถุดิบ / ผ้าขาวม้า / ผ้า',        0, null, 10),
  ('production', 'ค่าจ้างผลิต / เย็บ / ชุมชน',          3, 'ค่าจ้างทำของ มาตรา 40(8)', 20),
  ('packaging',  'แพคเกจจิ้ง / กล่อง / ถุง / ป้าย',     0, null, 30),
  ('printing',   'งานพิมพ์ / กระดาษ / สื่อ',             3, 'ค่าจ้างทำของ มาตรา 40(8)', 40),
  ('supplies',   'วัสดุสิ้นเปลือง / สำนักงาน',           0, null, 50),
  ('shipping',   'ค่าขนส่ง / โลจิสติกส์',                 1, 'ค่าขนส่ง มาตรา 40(8)', 60),
  ('marketing',  'การตลาด / โฆษณา / แพลตฟอร์ม',          2, 'ค่าโฆษณา มาตรา 40(8)', 70),
  ('service',    'ค่าบริการ / ซอฟต์แวร์ / ฟรีแลนซ์',     3, 'ค่าบริการ มาตรา 40(8)', 80),
  ('rent',       'ค่าเช่า',                               5, 'ค่าเช่า มาตรา 40(5)', 90),
  ('utilities',  'สาธารณูปโภค / น้ำ / ไฟ / เน็ต',        0, null, 100),
  ('pc_wage',    'ค่าจ้าง PC / คอมมิชชัน',                 0, null, 110),
  ('travel',     'เดินทาง / ที่พัก / น้ำมัน',              0, null, 120),
  ('other',      'อื่นๆ',                                 0, null, 999);

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id),
  exp_no          text not null,                         -- EXP + YYYYMM + 4 หลัก ต่อบริษัท
  supplier_id     uuid references public.contacts(id),
  supplier_name   text not null,
  supplier_tax_id text,
  supplier_address text,
  supplier_branch text,
  supplier_is_company boolean not null default true,    -- นิติบุคคล → ภ.ง.ด.53, บุคคล → ภ.ง.ด.3
  category_id     uuid references public.expense_categories(id),
  bill_no         text,                                  -- เลขที่บิล/ใบกำกับของซัพพลายเออร์
  bill_date       date not null default (now() at time zone 'Asia/Bangkok')::date,
  due_date        date,
  description     text,
  vat_mode        public.vat_mode not null default 'none',  -- none = บิลเงินสดไม่มี VAT, inclusive/exclusive = ใบกำกับภาษี
  vat_rate        numeric(5,2) not null default 7,
  discount_amount numeric(14,2) not null default 0,
  wht_pct         numeric(5,2) not null default 0,
  -- totals (recalc)
  subtotal        numeric(14,2) not null default 0,
  net_before_vat  numeric(14,2) not null default 0,
  vat_amount      numeric(14,2) not null default 0,
  grand_total     numeric(14,2) not null default 0,     -- ยอดตามบิล
  wht_amount      numeric(14,2) not null default 0,
  net_pay         numeric(14,2) not null default 0,     -- grand_total - wht
  -- workflow
  status          public.expense_status not null default 'draft',
  pay_round       date,                                  -- รอบจ่ายที่ตั้งใจ (1 หรือ 15)
  paid_date       date,
  paid_method     text,                                  -- โอน / เงินสด / เช็ค / บัตร
  paid_ref        text,
  approved_by     uuid references public.app_users(id),
  approved_at     timestamptz,
  review_note     text,
  -- source
  ai_extracted    jsonb,                                 -- ผลอ่านจาก AI (เก็บไว้เทียบ)
  note            text,
  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, exp_no)
);
create index on public.expenses (company_id, bill_date desc);
create index on public.expenses (status);
create index on public.expenses (pay_round);
create index on public.expenses (supplier_id);

create table public.expense_items (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  line_no     int not null default 1,
  description text not null,
  qty         numeric(12,2) not null default 1,
  unit        text,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) not null default 0,
  material_id uuid references public.materials(id),     -- ผูกกับลายผ้า/แพคเกจจิ้ง (ถ้าต้องการรับเข้าคลังวัสดุ)
  product_id  uuid references public.products(id)
);
create index on public.expense_items (expense_id);

create table public.expense_files (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  path        text not null,                             -- storage path ใน bucket expense-files
  kind        text not null default 'bill',              -- bill / slip / other
  created_at  timestamptz not null default now()
);

-- หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) — 1 ใบต่อบิล (หรือรวมหลายบิลของซัพพลายเออร์เดียวกันในอนาคต)
create table public.wht_certificates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  cert_no       text not null,                           -- WHT + YYYY(พ.ศ.) + 4 หลัก (เรียงต่อปี)
  expense_id    uuid references public.expenses(id) on delete set null,
  form          public.wht_form not null,
  payee_name    text not null,
  payee_tax_id  text,
  payee_address text,
  pay_date      date not null,
  income_type   text,
  income_amount numeric(14,2) not null,                  -- ยอดเงินที่จ่าย (ก่อน VAT)
  wht_pct       numeric(5,2) not null,
  wht_amount    numeric(14,2) not null,
  created_by    uuid references public.app_users(id),
  created_at    timestamptz not null default now(),
  unique (company_id, cert_no)
);

create table public.expense_counters (
  company_id uuid not null references public.companies(id),
  kind       text not null,                              -- 'EXP' or 'WHT'
  period     text not null,                              -- YYYYMM for EXP, YYYY(BE) for WHT
  last_no    int not null default 0,
  primary key (company_id, kind, period)
);

-- ---------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------
create or replace function public.next_expense_no(p_company uuid, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(p_date, 'YYYYMM'); v_no int;
begin
  insert into public.expense_counters (company_id, kind, period, last_no) values (p_company, 'EXP', v_period, 1)
  on conflict (company_id, kind, period) do update set last_no = public.expense_counters.last_no + 1
  returning last_no into v_no;
  return 'EXP' || v_period || lpad(v_no::text, 4, '0');
end $$;

create or replace function public.next_wht_no(p_company uuid, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare v_period text := (extract(year from p_date)::int + 543)::text; v_no int;
begin
  insert into public.expense_counters (company_id, kind, period, last_no) values (p_company, 'WHT', v_period, 1)
  on conflict (company_id, kind, period) do update set last_no = public.expense_counters.last_no + 1
  returning last_no into v_no;
  return 'WHT' || v_period || lpad(v_no::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------
create or replace function public.recalc_expense(p_id uuid) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; v_sub numeric; v_after numeric; v_net numeric; v_vat numeric; v_grand numeric; v_wht numeric;
begin
  select * into e from public.expenses where id = p_id;
  update public.expense_items set amount = round(qty * unit_price, 2) where expense_id = p_id;
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

-- ---------------------------------------------------------------------
-- Create / update (draft or pending)
-- ---------------------------------------------------------------------
create or replace function public.can_expense() returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_sell();   -- admin + ทีม SW บันทึกบิลได้
$$;

create or replace function public.create_expense(
  p_company uuid, p_supplier uuid, p_supplier_name text, p_supplier_tax_id text, p_supplier_address text, p_supplier_branch text, p_supplier_is_company boolean,
  p_category uuid, p_bill_no text, p_bill_date date, p_due_date date, p_description text, p_vat_mode public.vat_mode, p_discount numeric, p_wht_pct numeric,
  p_pay_round date, p_note text, p_items jsonb, p_files jsonb, p_ai jsonb, p_submit boolean default true
) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; it jsonb; i int := 0; f jsonb;
begin
  if not public.can_expense() then raise exception 'ไม่มีสิทธิ์บันทึกค่าใช้จ่าย'; end if;
  insert into public.expenses (company_id, exp_no, supplier_id, supplier_name, supplier_tax_id, supplier_address, supplier_branch, supplier_is_company, category_id, bill_no, bill_date, due_date,
      description, vat_mode, discount_amount, wht_pct, pay_round, note, ai_extracted, status, created_by)
  values (p_company, public.next_expense_no(p_company, coalesce(p_bill_date, current_date)), p_supplier, p_supplier_name, p_supplier_tax_id, p_supplier_address, p_supplier_branch, coalesce(p_supplier_is_company, true),
      p_category, p_bill_no, coalesce(p_bill_date, current_date), p_due_date, p_description, coalesce(p_vat_mode, 'none'), coalesce(p_discount, 0), coalesce(p_wht_pct, 0),
      p_pay_round, p_note, p_ai, (case when coalesce(p_submit, true) then 'pending' else 'draft' end)::public.expense_status, public.current_app_user_id())
  returning * into e;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.expense_items (expense_id, line_no, description, qty, unit, unit_price, material_id, product_id)
    values (e.id, i, coalesce(it->>'description', ''), coalesce((it->>'qty')::numeric, 1), nullif(it->>'unit', ''), coalesce((it->>'unit_price')::numeric, 0),
            nullif(it->>'material_id', '')::uuid, nullif(it->>'product_id', '')::uuid);
  end loop;
  for f in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    insert into public.expense_files (expense_id, path, kind) values (e.id, f->>'path', coalesce(f->>'kind', 'bill'));
  end loop;
  return public.recalc_expense(e.id);
end $$;

create or replace function public.update_expense(
  p_id uuid, p_supplier uuid, p_supplier_name text, p_supplier_tax_id text, p_supplier_address text, p_supplier_branch text, p_supplier_is_company boolean,
  p_category uuid, p_bill_no text, p_bill_date date, p_due_date date, p_description text, p_vat_mode public.vat_mode, p_discount numeric, p_wht_pct numeric,
  p_pay_round date, p_note text, p_items jsonb
) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; it jsonb; i int := 0;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status not in ('draft', 'pending', 'rejected') then raise exception 'แก้ไขได้เฉพาะรายการที่ยังไม่อนุมัติ'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'แก้ได้เฉพาะผู้บันทึกหรือ admin'; end if;
  update public.expenses set supplier_id = p_supplier, supplier_name = p_supplier_name, supplier_tax_id = p_supplier_tax_id, supplier_address = p_supplier_address, supplier_branch = p_supplier_branch,
    supplier_is_company = coalesce(p_supplier_is_company, true), category_id = p_category, bill_no = p_bill_no, bill_date = coalesce(p_bill_date, bill_date), due_date = p_due_date,
    description = p_description, vat_mode = coalesce(p_vat_mode, 'none'), discount_amount = coalesce(p_discount, 0), wht_pct = coalesce(p_wht_pct, 0), pay_round = p_pay_round, note = p_note,
    status = (case when status = 'rejected' then 'pending'::public.expense_status else status end), review_note = case when status = 'rejected' then null else review_note end
  where id = p_id;
  delete from public.expense_items where expense_id = p_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.expense_items (expense_id, line_no, description, qty, unit, unit_price, material_id, product_id)
    values (p_id, i, coalesce(it->>'description', ''), coalesce((it->>'qty')::numeric, 1), nullif(it->>'unit', ''), coalesce((it->>'unit_price')::numeric, 0),
            nullif(it->>'material_id', '')::uuid, nullif(it->>'product_id', '')::uuid);
  end loop;
  return public.recalc_expense(p_id);
end $$;

-- ---------------------------------------------------------------------
-- Approval (admin only) → paid (admin only)
-- ---------------------------------------------------------------------
create or replace function public.review_expense(p_id uuid, p_decision text, p_note text default null, p_pay_round date default null) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.is_admin() then raise exception 'อนุมัติค่าใช้จ่ายได้เฉพาะผู้บริหาร'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status not in ('pending', 'draft') then raise exception 'รายการนี้ถูกพิจารณาแล้ว'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'decision ต้องเป็น approved หรือ rejected'; end if;
  update public.expenses set status = p_decision::public.expense_status, approved_by = public.current_app_user_id(), approved_at = now(), review_note = p_note,
         pay_round = coalesce(p_pay_round, pay_round), updated_at = now()
   where id = p_id returning * into e;
  return e;
end $$;

create or replace function public.pay_expense(p_id uuid, p_paid_date date, p_method text, p_ref text, p_issue_wht boolean default true) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses; v_no text;
begin
  if not public.is_admin() then raise exception 'บันทึกการจ่ายได้เฉพาะผู้บริหาร'; end if;
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status <> 'approved' then raise exception 'ต้องอนุมัติก่อนจึงจะจ่ายได้'; end if;
  update public.expenses set status = 'paid', paid_date = coalesce(p_paid_date, current_date), paid_method = p_method, paid_ref = p_ref, updated_at = now()
   where id = p_id returning * into e;
  if coalesce(p_issue_wht, true) and e.wht_amount > 0 and not exists (select 1 from public.wht_certificates where expense_id = p_id) then
    v_no := public.next_wht_no(e.company_id, e.paid_date);
    insert into public.wht_certificates (company_id, cert_no, expense_id, form, payee_name, payee_tax_id, payee_address, pay_date, income_type, income_amount, wht_pct, wht_amount, created_by)
    select e.company_id, v_no, e.id, (case when e.supplier_is_company then 'pnd53' else 'pnd3' end)::public.wht_form, e.supplier_name, e.supplier_tax_id, e.supplier_address, e.paid_date,
           coalesce(c.wht_income_type, 'ค่าจ้าง/ค่าบริการ มาตรา 40(8)'), e.net_before_vat, e.wht_pct, e.wht_amount, public.current_app_user_id()
      from (select 1) x left join public.expense_categories c on c.id = e.category_id;
  end if;
  return e;
end $$;

create or replace function public.cancel_expense(p_id uuid, p_reason text) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_id;
  if e.id is null then raise exception 'ไม่พบรายการ'; end if;
  if e.status = 'paid' and not public.is_admin() then raise exception 'ยกเลิกรายการที่จ่ายแล้วได้เฉพาะผู้บริหาร'; end if;
  if not (public.is_admin() or e.created_by = public.current_app_user_id()) then raise exception 'ยกเลิกได้เฉพาะผู้บันทึกหรือ admin'; end if;
  update public.expenses set status = 'cancelled', review_note = coalesce(p_reason, review_note), updated_at = now() where id = p_id returning * into e;
  return e;
end $$;

-- ---------------------------------------------------------------------
-- Summary for dashboard / payables
-- ---------------------------------------------------------------------
create or replace function public.expense_summary(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pending_count',  (select count(*) from public.expenses where status = 'pending'),
    'pending_amount', (select coalesce(sum(net_pay), 0) from public.expenses where status = 'pending'),
    'approved_count', (select count(*) from public.expenses where status = 'approved'),
    'approved_amount',(select coalesce(sum(net_pay), 0) from public.expenses where status = 'approved'),
    'paid_amount',    (select coalesce(sum(grand_total), 0) from public.expenses where status = 'paid' and paid_date between p_from and p_to),
    'vat_in',         (select coalesce(sum(vat_amount), 0) from public.expenses where status in ('approved', 'paid') and bill_date between p_from and p_to),
    'wht_total',      (select coalesce(sum(wht_amount), 0) from public.expenses where status = 'paid' and paid_date between p_from and p_to),
    'by_category',    (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'amount', s.amt) order by s.amt desc), '[]'::jsonb)
                         from (select category_id, sum(grand_total) amt from public.expenses where status in ('approved', 'paid') and bill_date between p_from and p_to group by category_id) s
                         left join public.expense_categories c on c.id = s.category_id)
  );
$$;

-- ---------------------------------------------------------------------
-- RLS — staff see their own, admins see all
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_files enable row level security;
alter table public.wht_certificates enable row level security;
alter table public.expense_counters enable row level security;

create policy "exp cat read" on public.expense_categories for select to authenticated using (true);
create policy "exp cat admin" on public.expense_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "expenses read" on public.expenses for select to authenticated
  using (public.is_admin() or created_by = public.current_app_user_id());
create policy "expense items read" on public.expense_items for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and (public.is_admin() or e.created_by = public.current_app_user_id())));
create policy "expense files read" on public.expense_files for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and (public.is_admin() or e.created_by = public.current_app_user_id())));
create policy "wht read" on public.wht_certificates for select to authenticated using (public.is_admin() or exists (select 1 from public.expenses e where e.id = expense_id and e.created_by = public.current_app_user_id()));
-- writes go through security-definer functions only

-- Storage bucket for bill images (private — served via signed URLs)
insert into storage.buckets (id, name, public) values ('expense-files', 'expense-files', false) on conflict (id) do nothing;
create policy "expense files read"   on storage.objects for select to authenticated using (bucket_id = 'expense-files');
create policy "expense files write"  on storage.objects for insert to authenticated with check (bucket_id = 'expense-files');
create policy "expense files delete" on storage.objects for delete to authenticated using (bucket_id = 'expense-files' and public.is_admin());

-- supplier defaults (เหมือนฝั่งลูกค้า)
alter table public.contacts add column if not exists default_expense_category uuid references public.expense_categories(id);
alter table public.contacts add column if not exists default_wht_pct numeric(5,2);
alter table public.contacts add column if not exists default_vat_mode_purchase public.vat_mode;
