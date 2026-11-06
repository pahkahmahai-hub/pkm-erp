"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";

export async function saveGeneral(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const workdays = [1, 2, 3, 4, 5, 6, 7].filter((d) => formData.get(`wd_${d}`) === "on");
  const updates = [
    { key: "office_location", value: { name: formData.get("office_name"), lat: Number(formData.get("lat")), lng: Number(formData.get("lng")), radius_m: Number(formData.get("radius_m")) } },
    { key: "work_hours", value: { start: formData.get("start"), end: formData.get("end") } },
    { key: "late_grace_minutes", value: Number(formData.get("grace")) },
    { key: "workdays", value: workdays },
  ];
  for (const u of updates) {
    const { error } = await supabase.from("settings").update({ value: u.value }).eq("key", u.key);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function saveLeaveTypes(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const codes = formData.getAll("code") as string[];
  for (const code of codes) {
    await supabase.from("leave_types").update({ quota_days: Number(formData.get(`quota_${code}`)) }).eq("code", code);
  }
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function addHoliday(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("holidays").upsert({ holiday_date: formData.get("holiday_date"), name: formData.get("name") });
  revalidatePath("/settings");
}

export async function deleteHoliday(date: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("holidays").delete().eq("holiday_date", date);
  revalidatePath("/settings");
}

export async function addUser(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const email = String(formData.get("email")).trim().toLowerCase();
  const { error } = await supabase.from("app_users").insert({ email, role: formData.get("role"), display_name: (formData.get("display_name") as string) || null });
  if (error) redirect("/settings?error=" + encodeURIComponent(error.message));
  revalidatePath("/settings");
}

export async function setUserRole(id: string, role: "admin" | "staff") {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("app_users").update({ role }).eq("id", id);
  revalidatePath("/settings");
}

export async function toggleUser(id: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("app_users").update({ is_active: active }).eq("id", id);
  revalidatePath("/settings");
}
