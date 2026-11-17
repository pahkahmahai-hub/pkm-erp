-- =====================================================================
-- 0066: ใบงานสั่งสินค้า (Order Specification Sheet) สำหรับออเดอร์ Corporate
--   ออเดอร์ 1 ใบ มีหลายรายการสินค้า (A.1, A.2 …) · แต่ละรายการมีสเปก รูป และขั้นตอนของตัวเอง
--   ขั้นตอน: แบบที่มีอยู่แล้ว (existing) / แบบใหม่ (new) · มอบหมายได้ทุกคน (รวมผู้บริหาร) + กำหนดส่ง
--   มอบหมายพนักงาน → สร้างงานใน WORK (ห้อง OPERATION) ผูกกับขั้นตอน · งานเสร็จ = ขั้นตอนเสร็จ (sync 2 ทาง)
--   รูป: ภาพสินค้า / ภาพใส่โลโก้ (mockup) / แพคเกจจิ้ง / ตัวอย่าง · ลูกค้าคอนเฟิร์ม = ล็อกรูปเข้า Spec Sheet + Rev +1
-- =====================================================================
alter table public.corp_orders add column if not exists customer_tax_id text;
alter table public.corp_orders add column if not exists customer_address text;
alter table public.corp_orders add column if not exists contact_email text;
alter table public.corp_orders add column if not exists po_no text;
alter table public.corp_orders add column if not exists spec_rev int not null default 0;

create table if not exists public.corp_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.corp_orders(id) on delete cascade,
  line_code       text,                                   -- เช่น A.1
  name            text not null,                          -- ชื่อสินค้า/งาน
  design_type     text not null default 'existing' check (design_type in ('existing', 'new')),
  base_model      text,                                   -- แบบสินค้าที่มี (รุ่น/SKU)
  qty             int,
  unit            text not null default 'ชิ้น',
  size            text,
  material        text,
  color_process   text,                                   -- สี / เทคนิคการผลิต
  pantone         text,
  logo_method     text check (logo_method is null or logo_method in ('screen', 'embroider', 'dft', 'sticker', 'other')),
  logo_position   text,                                   -- ตำแหน่งโลโก้
  tag_position    text,                                   -- ตำแหน่งติด Tag
  packaging       text,                                   -- รายละเอียดแพคเกจจิ้ง
  sample_required boolean not null default false,
  supplier_name   text,                                   -- ผู้ผลิต (ไม่แสดงในฉบับลูกค้า)
  remarks         text,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists corp_order_items_order on public.corp_order_items (order_id, sort);

create table if not exists public.corp_item_steps (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.corp_order_items(id) on delete cascade,
  order_id         uuid not null references public.corp_orders(id) on delete cascade,
  step_key         text not null,
  label            text not null,
  sort             int not null default 0,
  optional         boolean not null default false,
  assignee_id      uuid references public.employees(id) on delete set null,
  assignee_user_id uuid references public.app_users(id) on delete set null,   -- ผู้บริหาร (ไม่มีประวัติพนักงาน)
  due_date         date,
  status           text not null default 'todo' check (status in ('todo', 'done', 'skipped')),
  done_at          timestamptz,
  done_by          uuid references public.app_users(id) on delete set null,
  task_id          uuid references public.work_tasks(id) on delete set null,
  note             text
);
create index if not exists corp_item_steps_item on public.corp_item_steps (item_id, sort);
create index if not exists corp_item_steps_assignee on public.corp_item_steps (assignee_id) where status = 'todo';

create table if not exists public.corp_item_images (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.corp_order_items(id) on delete cascade,
  order_id      uuid not null references public.corp_orders(id) on delete cascade,
  kind          text not null check (kind in ('product', 'mockup', 'packaging', 'sample', 'reference')),
  url           text not null,
  caption       text,
  status        text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  approved_at   timestamptz,
  approved_by   uuid references public.app_users(id) on delete set null,
  evidence_url  text,                                     -- หลักฐานลูกค้าคอนเฟิร์ม (แชท/อีเมล/เอกสารเซ็น)
  evidence_note text,
  created_by    uuid references public.app_users(id) default public.current_app_user_id(),
  created_at    timestamptz not null default now()
);
create index if not exists corp_item_images_item on public.corp_item_images (item_id, kind, created_at);

alter table public.work_tasks add column if not exists corp_step_id uuid references public.corp_item_steps(id) on delete set null;

-- ---------------------------------------------------------------------
-- สิทธิ์: ทีม OPERATION (can_corp) หรือคนที่ได้รับมอบหมายขั้นตอนในออเดอร์นั้น
create or replace function public.can_corp_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_corp() or exists (
    select 1 from public.corp_item_steps s
     where s.order_id = p_order
       and ((public.my_employee_id() is not null and s.assignee_id = public.my_employee_id()) or s.assignee_user_id = public.current_app_user_id()));
$$;
grant execute on function public.can_corp_order(uuid) to authenticated;

drop policy if exists "corp read" on public.corp_orders;
create policy "corp read" on public.corp_orders for select to authenticated using (public.can_corp_order(id));
drop policy if exists "corp files read" on public.corp_order_files;
create policy "corp files read" on public.corp_order_files for select to authenticated using (public.can_corp_order(order_id));

alter table public.corp_order_items enable row level security;
alter table public.corp_item_steps  enable row level security;
alter table public.corp_item_images enable row level security;
drop policy if exists "corp items read" on public.corp_order_items;
drop policy if exists "corp items write" on public.corp_order_items;
create policy "corp items read"  on public.corp_order_items for select to authenticated using (public.can_corp_order(order_id));
create policy "corp items write" on public.corp_order_items for all to authenticated using (public.can_corp_order(order_id)) with check (public.can_corp_order(order_id));
drop policy if exists "corp steps read" on public.corp_item_steps;
drop policy if exists "corp steps write" on public.corp_item_steps;
create policy "corp steps read"  on public.corp_item_steps for select to authenticated using (public.can_corp_order(order_id));
create policy "corp steps write" on public.corp_item_steps for all to authenticated using (public.can_corp()) with check (public.can_corp());
drop policy if exists "corp images read" on public.corp_item_images;
drop policy if exists "corp images insert" on public.corp_item_images;
drop policy if exists "corp images delete" on public.corp_item_images;
create policy "corp images read"   on public.corp_item_images for select to authenticated using (public.can_corp_order(order_id));
create policy "corp images insert" on public.corp_item_images for insert to authenticated with check (public.can_corp_order(order_id));
create policy "corp images delete" on public.corp_item_images for delete to authenticated using (status <> 'approved' and (public.can_corp_delete() or created_by = public.current_app_user_id()));

-- ---------------------------------------------------------------------
-- มอบหมายขั้นตอน: พนักงาน → สร้าง/อัปเดตงานใน WORK · ผู้บริหาร → แจ้งเตือน
create or replace function public.corp_assign_step(p_step uuid, p_emp uuid, p_user uuid, p_due date) returns void
language plpgsql security definer set search_path = public as $$
declare s public.corp_item_steps; it public.corp_order_items; o public.corp_orders; v_task uuid; v_title text; v_me uuid := public.current_app_user_id(); v_due text;
begin
  select * into s from public.corp_item_steps where id = p_step;
  if s.id is null then raise exception 'ไม่พบขั้นตอน'; end if;
  if not (public.can_corp() or s.assignee_id = public.my_employee_id() or s.assignee_user_id = v_me) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into it from public.corp_order_items where id = s.item_id;
  select * into o from public.corp_orders where id = s.order_id;
  v_title := format('[%s%s] %s · %s', o.order_no, coalesce(' ' || it.line_code, ''), s.label, it.name);
  v_due := case when p_due is not null then ' · ครบ ' || to_char(p_due, 'DD/MM') else '' end;
  update public.corp_item_steps set assignee_id = p_emp, assignee_user_id = case when p_emp is null then p_user else null end, due_date = p_due where id = p_step;

  if p_emp is not null then
    if s.task_id is not null and exists (select 1 from public.work_tasks where id = s.task_id and status not in ('accepted', 'cancelled')) then
      update public.work_tasks set assignee_id = p_emp, due_date = p_due, title = v_title where id = s.task_id;
      if s.assignee_id is distinct from p_emp then
        perform public.notify_user(public.user_id_of_employee(p_emp), s.task_id, 'ได้รับมอบหมาย: ' || v_title || v_due);
      end if;
    else
      insert into public.work_tasks (room_id, title, description, assignee_id, due_date, priority, created_by, corp_step_id)
      values (public.corp_room_id(), v_title,
              format('ขั้นตอนของออเดอร์ Corporate %s · %s%s%s', o.order_no, coalesce(o.customer_label, o.customer_name), E'\n', '/work/rooms/operation/corporate/' || o.id),
              p_emp, p_due, 'normal', v_me, p_step)
      returning id into v_task;
      update public.corp_item_steps set task_id = v_task where id = p_step;
      perform public.notify_user(public.user_id_of_employee(p_emp), v_task, 'ได้รับมอบหมาย: ' || v_title || v_due);
    end if;
  elsif s.task_id is not null then
    update public.work_tasks set status = 'cancelled' where id = s.task_id and status not in ('accepted', 'cancelled');
    update public.corp_item_steps set task_id = null where id = p_step;
  end if;
  if p_emp is null and p_user is not null and p_user is distinct from s.assignee_user_id then
    insert into public.work_notifications (user_id, message) values (p_user, 'ได้รับมอบหมาย: ' || v_title || v_due);
  end if;
  insert into public.corp_order_log (order_id, message) values (o.id, format('มอบหมาย "%s" (%s) ให้ %s%s', s.label, coalesce(it.line_code, it.name),
    coalesce(public.emp_name(p_emp), (select coalesce(display_name, split_part(email, '@', 1)) from public.app_users where id = p_user), '—'), v_due));
end $$;
grant execute on function public.corp_assign_step(uuid, uuid, uuid, date) to authenticated;

-- เปลี่ยนสถานะขั้นตอน (todo / done / skipped) — งานใน WORK ที่ผูกไว้ปิดตาม
create or replace function public.corp_set_step(p_step uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.corp_item_steps; v_me uuid := public.current_app_user_id();
begin
  select * into s from public.corp_item_steps where id = p_step;
  if s.id is null then raise exception 'ไม่พบขั้นตอน'; end if;
  if p_status not in ('todo', 'done', 'skipped') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  if not (public.can_corp() or s.assignee_id = public.my_employee_id() or s.assignee_user_id = v_me) then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.corp_item_steps set status = p_status, done_at = case when p_status = 'done' then now() else null end, done_by = case when p_status = 'done' then v_me else null end where id = p_step;
  if s.task_id is not null then
    if p_status in ('done', 'skipped') then
      update public.work_tasks set status = case when p_status = 'done' then 'accepted' else 'cancelled' end::public.task_status,
             done_at = coalesce(done_at, now()), reviewed_at = now() where id = s.task_id and status not in ('accepted', 'cancelled');
    else
      update public.work_tasks set status = 'in_progress' where id = s.task_id and status in ('accepted', 'cancelled');
    end if;
  end if;
  insert into public.corp_order_log (order_id, message) values (s.order_id, format('ขั้นตอน "%s" → %s', s.label, case p_status when 'done' then 'เสร็จ' when 'skipped' then 'ข้าม' else 'ยังไม่เสร็จ' end));
end $$;
grant execute on function public.corp_set_step(uuid, text) to authenticated;

-- งานใน WORK เปลี่ยน → ขั้นตอนตาม (ส่งงาน/ตรวจรับ = เสร็จ · เลื่อนกำหนด/โอนงาน = อัปเดต)
create or replace function public.corp_step_follow_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.corp_step_id is null then return new; end if;
  update public.corp_item_steps s set
    status = case when new.status in ('done', 'accepted') then 'done' when new.status = 'cancelled' then s.status else case when s.status = 'done' then 'todo' else s.status end end,
    done_at = case when new.status in ('done', 'accepted') then coalesce(s.done_at, now()) when new.status = 'cancelled' then s.done_at else null end,
    due_date = new.due_date,
    assignee_id = coalesce(new.assignee_id, s.assignee_id)
   where s.id = new.corp_step_id
     and (old.status is distinct from new.status or old.due_date is distinct from new.due_date or old.assignee_id is distinct from new.assignee_id);
  return new;
end $$;
drop trigger if exists trg_corp_step_follow_task on public.work_tasks;
create trigger trg_corp_step_follow_task after update on public.work_tasks for each row execute function public.corp_step_follow_task();

-- ลูกค้าคอนเฟิร์มรูป → ล็อกเข้า Spec Sheet · Rev +1 · ติ๊กขั้นตอน "ลูกค้าคอนเฟิร์ม…" ให้อัตโนมัติ
create or replace function public.corp_approve_image(p_image uuid, p_evidence_url text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare im public.corp_item_images; v_key text;
begin
  select * into im from public.corp_item_images where id = p_image;
  if im.id is null then raise exception 'ไม่พบรูป'; end if;
  if not public.can_corp() then raise exception 'เฉพาะทีม OPERATION / ผู้บริหาร'; end if;
  update public.corp_item_images set status = 'approved', approved_at = now(), approved_by = public.current_app_user_id(),
         evidence_url = nullif(trim(p_evidence_url), ''), evidence_note = nullif(trim(p_note), '') where id = p_image;
  update public.corp_orders set spec_rev = spec_rev + 1 where id = im.order_id;
  v_key := case im.kind when 'mockup' then 'confirm_design' when 'product' then 'confirm_design' when 'packaging' then 'confirm_packaging' when 'sample' then 'confirm_sample' else null end;
  if v_key is not null then
    perform public.corp_set_step(s.id, 'done') from public.corp_item_steps s where s.item_id = im.item_id and s.step_key = v_key and s.status = 'todo';
  end if;
  insert into public.corp_order_log (order_id, message) values (im.order_id, format('ลูกค้าคอนเฟิร์ม%s%s', case im.kind when 'product' then 'ภาพสินค้า' when 'mockup' then 'แบบใส่โลโก้' when 'packaging' then 'แพคเกจจิ้ง' when 'sample' then 'ตัวอย่าง' else 'รูปอ้างอิง' end, coalesce(' · ' || nullif(trim(p_note), ''), '')));
end $$;
grant execute on function public.corp_approve_image(uuid, text, text) to authenticated;

create or replace function public.corp_unapprove_image(p_image uuid) returns void
language plpgsql security definer set search_path = public as $$
declare im public.corp_item_images;
begin
  select * into im from public.corp_item_images where id = p_image;
  if not public.can_corp_delete() then raise exception 'เฉพาะหัวหน้าห้อง / ผู้บริหาร'; end if;
  update public.corp_item_images set status = 'draft', approved_at = null, approved_by = null where id = p_image;
  update public.corp_orders set spec_rev = spec_rev + 1 where id = im.order_id;
  insert into public.corp_order_log (order_id, message) values (im.order_id, 'ยกเลิกคอนเฟิร์มรูป (แก้แบบ)');
end $$;
grant execute on function public.corp_unapprove_image(uuid) to authenticated;
