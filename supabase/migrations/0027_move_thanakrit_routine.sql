-- =====================================================================
-- PKM ERP — 0027: ย้ายตารางงาน Routine content ของธนกฤต จาก GC ROOM → ห้อง CONTENT
--   ย้ายหัวข้อ Routine, งานประจำ (กฎสร้างงานอัตโนมัติ) และงานทั้งหมดที่ผูกกับหัวข้อ/งานประจำนั้น (รวมประวัติ)
--   อารดาเป็นหัวหน้า ★ ในห้อง CONTENT ด้วย เพื่อยังกดตรวจรับ Routine content ของธนกฤตได้เหมือนเดิม
-- =====================================================================
do $$
declare v_gc uuid; v_content uuid; v_thanakrit uuid; v_arada uuid; n_topics int; n_routines int; n_tasks int;
begin
  select id into v_gc      from public.work_rooms where key = 'gc-room';
  select id into v_content from public.work_rooms where key = 'content';
  select id into v_thanakrit from public.employees where first_name = 'ธนกฤต' and status <> 'resigned' limit 1;
  select id into v_arada     from public.employees where first_name = 'อารดา'  and status <> 'resigned' limit 1;
  if v_gc is null or v_content is null or v_thanakrit is null then raise exception 'ไม่พบห้อง content / gc-room หรือพนักงานธนกฤต'; end if;

  -- สมาชิกห้อง CONTENT: ธนกฤต + อารดา (หัวหน้า ★)
  insert into public.work_room_members (room_id, employee_id) values (v_content, v_thanakrit) on conflict do nothing;
  if v_arada is not null then
    insert into public.work_room_members (room_id, employee_id, is_lead) values (v_content, v_arada, true) on conflict do nothing;
    update public.work_room_members set is_lead = true where room_id = v_content and employee_id = v_arada;
  end if;

  -- งานที่ผูกกับหัวข้อ/งานประจำของธนกฤตใน GC ROOM
  update public.work_tasks t set room_id = v_content
   where t.room_id = v_gc
     and (t.topic_id in (select id from public.work_topics where room_id = v_gc and employee_id = v_thanakrit)
          or t.routine_id in (select id from public.work_routines where room_id = v_gc and assignee_id = v_thanakrit));
  get diagnostics n_tasks = row_count;

  update public.work_routines set room_id = v_content where room_id = v_gc and assignee_id = v_thanakrit;
  get diagnostics n_routines = row_count;

  update public.work_topics set room_id = v_content where room_id = v_gc and employee_id = v_thanakrit;
  get diagnostics n_topics = row_count;

  raise notice 'ย้ายแล้ว: หัวข้อ % · งานประจำ % · งาน %', n_topics, n_routines, n_tasks;
end $$;
