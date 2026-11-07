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
  const row = { room_id: formData.get("room_id"), title: String(formData.get("title")).trim(), description: nul(formData.get("description")), assignee_id: nul(formData.get("assignee_id")), weekdays, is_active: formData.get("is_active") !== "off" };
  const { error } = id ? await supabase.from("work_routines").update(row).eq("id", id) : await supabase.from("work_routines").insert(row);
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
  const { data, error } = await supabase.from("work_room_messages").insert({ room_id: roomId, author_id: s.appUser.id, body, image_url, file_url, file_name }).select("*").single();
  if (error) return { error: error.message };
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
