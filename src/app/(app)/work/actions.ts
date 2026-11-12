"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };

export async function createTask(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const roomId = String(formData.get("room_id"));
  const checklist = String(formData.get("checklist") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const { data, error } = await supabase.rpc("create_task", {
    p_room: roomId,
    p_title: String(formData.get("title")).trim(),
    p_description: nul(formData.get("description")),
    p_assignee: nul(formData.get("assignee_id")),
    p_due: nul(formData.get("due_date")),
    p_priority: formData.get("priority") === "urgent" ? "urgent" : "normal",
    p_checklist: checklist,
  });
  if (error) redirect(`/work/tasks/new?room=${roomId}&error=${encodeURIComponent(error.message)}`);
  const fromMessage = nul(formData.get("from_message"));
  if (fromMessage) await supabase.from("work_room_messages").update({ task_id: data.id }).eq("id", fromMessage);
  revalidatePath("/work");
  redirect(`/work/tasks/${data.id}?created=1`);
}

export async function setTaskStatus(id: string, status: string, formData?: FormData) {
  await getSession();
  const supabase = await createClient();
  const note = formData ? nul(formData.get("note")) : null;
  const { error } = await supabase.rpc("set_task_status", { p_task: id, p_status: status, p_note: note });
  if (error) redirect(`/work/tasks/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/work/tasks/${id}`);
  revalidatePath("/work");
}

export async function updateTask(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("work_tasks").update({
    title: String(formData.get("title")).trim(),
    description: nul(formData.get("description")),
    assignee_id: nul(formData.get("assignee_id")),
    due_date: nul(formData.get("due_date")),
    priority: formData.get("priority") === "urgent" ? "urgent" : "normal",
    ...(formData.has("start_date") ? { start_date: nul(formData.get("start_date")), due_time: nul(formData.get("due_time")), topic_id: nul(formData.get("topic_id")) } : {}),
  }).eq("id", id);
  if (error) redirect(`/work/tasks/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/work/tasks/${id}`);
  redirect(`/work/tasks/${id}?saved=1`);
}

export async function deleteTask(id: string, roomKey: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("work_tasks").delete().eq("id", id);
  if (error) redirect(`/work/tasks/${id}?error=${encodeURIComponent("ลบไม่ได้ — เฉพาะผู้สั่งงานหรือผู้ดูแล")}`);
  revalidatePath("/work");
  redirect(`/work/rooms/${roomKey}?deleted=1`);
}

export async function toggleChecklist(id: string, taskId: string, done: boolean) {
  const s = await getSession();
  const supabase = await createClient();
  await supabase.from("work_checklist").update({ is_done: done, done_at: done ? new Date().toISOString() : null, done_by: done ? s.appUser.id : null }).eq("id", id);
  revalidatePath(`/work/tasks/${taskId}`);
}

export async function addChecklistItem(taskId: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const label = nul(formData.get("label"));
  if (!label) return;
  const { count } = await supabase.from("work_checklist").select("id", { count: "exact", head: true }).eq("task_id", taskId);
  await supabase.from("work_checklist").insert({ task_id: taskId, label, sort_order: count ?? 0 });
  revalidatePath(`/work/tasks/${taskId}`);
}

export async function deleteChecklistItem(id: string, taskId: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("work_checklist").delete().eq("id", id);
  revalidatePath(`/work/tasks/${taskId}`);
}

/** Upload (already compressed) image/file and post it as a comment. Returns error string if any. */
export async function postComment(taskId: string, formData: FormData): Promise<{ error?: string; row?: Record<string, unknown> }> {
  await getSession();
  const supabase = await createClient();
  let image_url: string | null = null;
  let file_url: string | null = null;
  let file_name: string | null = null;
  const file = formData.get("file") as File | null;
  if (file && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) return { error: "ไฟล์ใหญ่เกิน 20 MB" };
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("work-files").upload(path, file, { contentType: file.type });
    if (error) return { error: error.message };
    const url = supabase.storage.from("work-files").getPublicUrl(path).data.publicUrl;
    if (file.type.startsWith("image/")) image_url = url; else { file_url = url; file_name = file.name; }
  }
  const { data, error } = await supabase.rpc("add_comment", { p_task: taskId, p_body: nul(formData.get("body")) ?? "", p_image_url: image_url, p_file_url: file_url, p_file_name: file_name });
  if (error) return { error: error.message };
  const { data: me } = await supabase.from("app_users").select("display_name, email").eq("id", (await getSession()).appUser.id).maybeSingle();
  return { row: { ...(data as Record<string, unknown>), app_users: me } };
}

export async function deleteComment(id: string, taskId: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("work_comments").delete().eq("id", id);
  revalidatePath(`/work/tasks/${taskId}`);
}

// ---------- routines ----------
export async function saveRoutine(id: string | null, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const weekdays = [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`wd_${d}`) === "on");
  const base = { room_id: formData.get("room_id"), title: String(formData.get("title")).trim(), description: nul(formData.get("description")), assignee_id: nul(formData.get("assignee_id")), weekdays, is_active: formData.get("is_active") !== "off" };
  const ext = formData.has("rule") ? {   // 0018
    rule: String(formData.get("rule")), month_days: String(formData.get("month_days") ?? "").split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 31),
    due_friday: formData.get("due_friday") === "on", plan_ahead: formData.get("plan_ahead") === "on", priority: formData.get("urgent") === "on" ? "urgent" : "normal",
  } : {};
  const row: Record<string, unknown> = { ...base, ...ext };
  let { error } = id ? await supabase.from("work_routines").update(row).eq("id", id) : await supabase.from("work_routines").insert(row);
  if (error && formData.has("rule")) ({ error } = id ? await supabase.from("work_routines").update(base).eq("id", id) : await supabase.from("work_routines").insert(base));   // ก่อนรัน 0018
  if (error) redirect(`/work/routines?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/work/routines");
  redirect("/work/routines?saved=1");
}

export async function deleteRoutine(id: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("work_routines").delete().eq("id", id);
  revalidatePath("/work/routines");
}

// ---------- notifications ----------
export async function markAllRead() {
  const s = await getSession();
  const supabase = await createClient();
  await supabase.from("work_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", s.appUser.id).is("read_at", null);
  revalidatePath("/work");
}

// ---------- rooms (admin) ----------
export async function setRoomMember(roomId: string, employeeId: string, add: boolean, isLead = false) {
  await requireAdmin();
  const supabase = await createClient();
  if (add) await supabase.from("work_room_members").upsert({ room_id: roomId, employee_id: employeeId, is_lead: isLead });
  else await supabase.from("work_room_members").delete().eq("room_id", roomId).eq("employee_id", employeeId);
  revalidatePath("/work");
}

// ---------- room chat ----------
async function uploadWorkFile(roomId: string, file: File) {
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `rooms/${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("work-files").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from("work-files").getPublicUrl(path).data.publicUrl;
}

export async function postRoomMessage(roomId: string, formData: FormData): Promise<{ error?: string; row?: Record<string, unknown> }> {
  const s = await getSession();
  const supabase = await createClient();
  const body = nul(formData.get("body"));
  const file = formData.get("file") as File | null;
  let image_url: string | null = null, file_url: string | null = null, file_name: string | null = null;
  try {
    if (file && file.size > 0) {
      if (file.size > 20 * 1024 * 1024) return { error: "ไฟล์ใหญ่เกิน 20 MB" };
      const url = await uploadWorkFile(roomId, file);
      if (file.type.startsWith("image/")) image_url = url; else { file_url = url; file_name = file.name; }
    }
  } catch (e) { return { error: (e as Error).message }; }
  if (!body && !image_url && !file_url) return { error: "ข้อความว่าง" };
  let mentions: string[] = [];
  try { mentions = JSON.parse(String(formData.get("mentions") ?? "[]")); } catch { mentions = []; }
  const reply_to = nul(formData.get("reply_to"));
  let { data, error } = await supabase.from("work_room_messages").insert({ room_id: roomId, author_id: s.appUser.id, body, image_url, file_url, file_name, mentions, reply_to }).select("*").single();
  if (error && reply_to && /reply_to/.test(error.message)) ({ data, error } = await supabase.from("work_room_messages").insert({ room_id: roomId, author_id: s.appUser.id, body, image_url, file_url, file_name, mentions }).select("*").single());   // ก่อนรัน 0022
  if (error || !data) return { error: error?.message ?? "ส่งไม่สำเร็จ" };
  if (mentions.length) await supabase.rpc("notify_mentions", { p_message: data.id });
  await supabase.from("work_room_reads").upsert({ room_id: roomId, user_id: s.appUser.id, last_read_at: new Date().toISOString() });
  return { row: { ...data, app_users: { display_name: s.appUser.display_name, email: s.appUser.email } } };
}

export async function deleteRoomMessage(id: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("work_room_messages").delete().eq("id", id);
}

export async function markRoomRead(roomId: string) {
  const s = await getSession();
  const supabase = await createClient();
  await supabase.from("work_room_reads").upsert({ room_id: roomId, user_id: s.appUser.id, last_read_at: new Date().toISOString() });
}


/** Polling fallback: messages newer than `after` (ISO) for a thread or room */
export async function fetchNewer(table: "work_comments" | "work_room_messages", column: "task_id" | "room_id", value: string, after: string) {
  await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("*, app_users(display_name, email)").eq(column, value).gt("created_at", after).order("created_at").limit(100);
  return (data ?? []) as Record<string, unknown>[];
}

// ---------- ตารางส่งสินค้าห้าง ----------
export interface DeliveryPayload { id?: string | null; store_id: string; week: string; target_date?: string | null; step?: number | null; doc_no?: string | null; sales_doc_id?: string | null; po_no?: string | null; assignee_id?: string | null; note?: string | null }
export async function saveStoreDelivery(p: DeliveryPayload): Promise<{ error?: string; row?: Record<string, unknown> }> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_store_delivery", {
    p_id: p.id ?? null, p_store: p.store_id, p_week: p.week, p_target: p.target_date || null, p_step: p.step ?? null, p_doc_no: p.doc_no?.trim() || null,
    p_sales_doc: p.sales_doc_id || null, p_po: p.po_no?.trim() || null, p_assignee: p.assignee_id || null, p_note: p.note?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/work/deliveries");
  return { row: data as Record<string, unknown> };
}

export async function deleteStoreDelivery(id: string): Promise<{ error?: string }> {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_store_delivery", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/work/deliveries");
  return {};
}

export async function saveDeliveryStore(id: string | null, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_delivery_store", {
    p_id: id, p_name: String(formData.get("name")).trim(), p_short: nul(formData.get("short_name")), p_group: nul(formData.get("group_name")), p_contact: nul(formData.get("contact_id")),
    p_color: nul(formData.get("color")), p_sort: formData.get("sort_order") ? Number(formData.get("sort_order")) : null, p_active: formData.get("is_active") === "on",
  });
  if (error) redirect(`/work/deliveries/stores?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/work/deliveries");
  redirect("/work/deliveries/stores?saved=1");
}

export async function deleteDeliveryStore(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_delivery_store", { p_id: id });
  if (error) redirect(`/work/deliveries/stores?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/work/deliveries");
  redirect("/work/deliveries/stores?deleted=1");
}

export async function createDeliveryTask(id: string, title: string, description: string | null, checklist: string[]): Promise<{ error?: string; taskId?: string }> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_delivery_task", { p_id: id, p_title: title, p_description: description, p_checklist: checklist });
  if (error) return { error: error.message };
  revalidatePath("/work");
  return { taskId: (data as { id: string }).id };
}


// ---------- ปฏิทินงาน (0018) ----------
export async function createCalendarTask(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const roomKey = String(formData.get("room_key"));
  const week = nul(formData.get("week")) ?? "";
  const checklist = String(formData.get("checklist") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const { data, error } = await supabase.rpc("create_calendar_task", {
    p_room: String(formData.get("room_id")), p_title: String(formData.get("title")).trim(), p_description: nul(formData.get("description")), p_assignee: nul(formData.get("assignee_id")),
    p_start: nul(formData.get("start_date")), p_due: nul(formData.get("due_date")), p_due_time: nul(formData.get("due_time")), p_priority: formData.get("priority") === "urgent" ? "urgent" : "normal",
    p_topic: nul(formData.get("topic_id")), p_checklist: checklist,
  });
  const back = `/work/rooms/${roomKey}/calendar${week ? `?week=${week}` : ""}`;
  if (error) redirect(`${back}${week ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/work");
  if (formData.get("open") === "1") redirect(`/work/tasks/${data.id}?created=1`);
  redirect(`${back}${week ? "&" : "?"}created=${data.task_no}`);
}

export async function saveTopic(roomKey: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const id = nul(formData.get("id"));
  const row = { room_id: String(formData.get("room_id")), employee_id: nul(formData.get("employee_id")), name: String(formData.get("name")).trim(), color: nul(formData.get("color")) ?? "#452a79", sort_order: Number(formData.get("sort_order") ?? 100) };
  const { error } = id ? await supabase.from("work_topics").update(row).eq("id", id) : await supabase.from("work_topics").insert(row);
  if (error) redirect(`/work/rooms/${roomKey}/topics?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/work/rooms/${roomKey}`);
  redirect(`/work/rooms/${roomKey}/topics?saved=1`);
}

export async function deleteTopic(roomKey: string, id: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("work_topics").delete().eq("id", id);
  if (error) redirect(`/work/rooms/${roomKey}/topics?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/work/rooms/${roomKey}`);
  redirect(`/work/rooms/${roomKey}/topics?deleted=1`);
}

/** storyboard: แนบรูป/ไฟล์หลายไฟล์ให้งาน */
export async function addTaskFiles(taskId: string, roomId: string, formData: FormData) {
  const s = await getSession();
  const supabase = await createClient();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const caption = nul(formData.get("caption"));
  const { count } = await supabase.from("work_task_files").select("id", { count: "exact", head: true }).eq("task_id", taskId);
  let i = count ?? 0;
  for (const f of files) {
    try {
      const url = await uploadWorkFile(roomId, f);
      await supabase.from("work_task_files").insert({ task_id: taskId, url, name: f.name, caption, sort_order: i++, created_by: s.appUser.id });
    } catch (e) { redirect(`/work/tasks/${taskId}?error=${encodeURIComponent((e as Error).message)}`); }
  }
  revalidatePath(`/work/tasks/${taskId}`);
  redirect(`/work/tasks/${taskId}`);
}

export async function deleteTaskFile(taskId: string, fileId: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("work_task_files").delete().eq("id", fileId);
  revalidatePath(`/work/tasks/${taskId}`);
  redirect(`/work/tasks/${taskId}`);
}

// ---------- ปฏิทินบริษัท (0020) ----------
export async function saveCompanyEvent(formData: FormData): Promise<{ error?: string; row?: Record<string, unknown> }> {
  const s = await getSession();
  const supabase = await createClient();
  const id = nul(formData.get("id"));
  const start = String(formData.get("start_date"));
  const row = {
    title: String(formData.get("title")).trim(), category_id: nul(formData.get("category_id")), start_date: start, end_date: nul(formData.get("end_date")) ?? start,
    start_time: nul(formData.get("start_time")), end_time: nul(formData.get("end_time")), location: nul(formData.get("location")), note: nul(formData.get("note")),
    recur: nul(formData.get("recur")), recur_until: nul(formData.get("recur_until")),
  };
  if (row.end_date < row.start_date) row.end_date = row.start_date;
  const q = id ? supabase.from("company_events").update(row).eq("id", id).select("*, event_categories(*)").single() : supabase.from("company_events").insert({ ...row, created_by: s.appUser.id }).select("*, event_categories(*)").single();
  const { data, error } = await q;
  if (error) return { error: error.message };
  revalidatePath("/work/company-calendar");
  return { row: data as Record<string, unknown> };
}

export async function deleteCompanyEvent(id: string): Promise<{ error?: string }> {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("company_events").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/work/company-calendar");
  return {};
}

// ---------- วันหยุดประจำปี (0021) — ผู้บริหาร ----------
export async function saveHoliday(formData: FormData) {
  const s = await requireAdmin();
  const supabase = await createClient();
  const { data: cat } = await supabase.from("event_categories").select("id").eq("key", "holiday").single();
  const id = nul(formData.get("id"));
  const start = String(formData.get("start_date"));
  const row = { title: String(formData.get("title")).trim(), category_id: cat?.id ?? null, start_date: start, end_date: nul(formData.get("end_date")) ?? start, note: nul(formData.get("note")) };
  if (row.end_date < row.start_date) row.end_date = row.start_date;
  const { error } = id ? await supabase.from("company_events").update(row).eq("id", id) : await supabase.from("company_events").insert({ ...row, created_by: s.appUser.id });
  const year = start.slice(0, 4);
  if (error) redirect(`/work/holidays?year=${year}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/work/company-calendar");
  redirect(`/work/holidays?year=${year}&saved=1`);
}

export async function deleteHoliday(id: string, year: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("company_events").delete().eq("id", id);
  revalidatePath("/work/company-calendar");
  redirect(`/work/holidays?year=${year}&deleted=1`);
}
