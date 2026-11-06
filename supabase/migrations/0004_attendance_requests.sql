-- =====================================================================
-- PKM ERP — 0004: คำขอแก้เวลาเข้า-ออก (ลืมเช็คอิน/เช็คเอาท์)
-- Run after 0003
-- =====================================================================

create table public.attendance_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  work_date     date not null,
  requested_in  time,                 -- เวลาเข้าที่ขอ (null = ไม่แก้)
  requested_out time,                 -- เวลาออกที่ขอ (null = ไม่แก้)
  reason        text not null,
  status        public.request_status not null default 'pending',
  reviewed_by   uuid references public.app_users(id),
  reviewed_at   timestamptz,
  admin_note    text,
  created_at    timestamptz not null default now(),
  check (requested_in is not null or requested_out is not null)
);
create index on public.attendance_requests (employee_id, work_date);
create index on public.attendance_requests (status);

alter table public.attendance_requests enable row level security;
create policy "att_req self read"   on public.attendance_requests for select to authenticated using (employee_id = public.my_employee_id());
create policy "att_req self insert" on public.attendance_requests for insert to authenticated with check (employee_id = public.my_employee_id() and status = 'pending');
create policy "att_req self cancel" on public.attendance_requests for update to authenticated
  using (employee_id = public.my_employee_id() and status = 'pending')
  with check (employee_id = public.my_employee_id() and status in ('pending','cancelled'));
create policy "att_req admin"       on public.attendance_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- approve: write the times into attendance and recompute late status
create or replace function public.review_attendance_request(p_id uuid, p_decision public.request_status, p_note text default null)
returns public.attendance_requests
language plpgsql security definer set search_path = public as $$
declare
  v_r      public.attendance_requests;
  v_start  time;
  v_grace  int;
  v_in_ts  timestamptz;
  v_out_ts timestamptz;
  v_late   boolean := false;
  v_late_m int := 0;
  v_note   text;
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้ดูแลระบบ'; end if;
  select * into v_r from public.attendance_requests where id = p_id;
  if v_r.id is null then raise exception 'ไม่พบคำขอ'; end if;
  if v_r.status <> 'pending' then raise exception 'คำขอนี้ถูกพิจารณาแล้ว'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'invalid decision'; end if;

  if p_decision = 'approved' then
    select (value->>'start')::time into v_start from public.settings where key = 'work_hours';
    select (value #>> '{}')::int into v_grace from public.settings where key = 'late_grace_minutes';
    v_note := 'แก้เวลาตามคำขอ (อนุมัติ ' || to_char(now() at time zone 'Asia/Bangkok', 'DD/MM/YYYY') || ')';

    if v_r.requested_in is not null then
      v_in_ts := (v_r.work_date::text || ' ' || v_r.requested_in::text)::timestamp at time zone 'Asia/Bangkok';
      if v_r.requested_in > v_start + make_interval(mins => coalesce(v_grace, 0)) then
        v_late := true;
        v_late_m := extract(epoch from (v_r.requested_in - v_start))::int / 60;
      end if;
    end if;
    if v_r.requested_out is not null then
      v_out_ts := (v_r.work_date::text || ' ' || v_r.requested_out::text)::timestamp at time zone 'Asia/Bangkok';
    end if;

    insert into public.attendance (employee_id, work_date, check_in_at, check_out_at, is_late, late_minutes, admin_note)
    values (v_r.employee_id, v_r.work_date, v_in_ts, v_out_ts, v_late, v_late_m, v_note)
    on conflict (employee_id, work_date) do update
      set check_in_at  = coalesce(excluded.check_in_at, public.attendance.check_in_at),
          check_out_at = coalesce(excluded.check_out_at, public.attendance.check_out_at),
          -- recompute late only when the check-in time was changed
          is_late      = case when v_r.requested_in is not null then excluded.is_late else public.attendance.is_late end,
          late_minutes = case when v_r.requested_in is not null then excluded.late_minutes else public.attendance.late_minutes end,
          check_in_in_range  = case when v_r.requested_in  is not null then null else public.attendance.check_in_in_range end,
          check_out_in_range = case when v_r.requested_out is not null then null else public.attendance.check_out_in_range end,
          admin_note   = v_note;
  end if;

  update public.attendance_requests
     set status = p_decision, reviewed_by = public.current_app_user_id(), reviewed_at = now(), admin_note = p_note
   where id = p_id returning * into v_r;
  return v_r;
end $$;
