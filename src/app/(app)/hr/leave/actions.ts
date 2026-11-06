"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

export async function submitLeave(formData: FormData) {
  const session = await getSession();
  if (!session.employee) throw new Error("บัญชีนี้ไม่ได้ผูกกับพนักงาน");
  const supabase = await createClient();

  const start_date = String(formData.get("start_date"));
  const end_date = String(formData.get("end_date") || start_date);
  const half = formData.get("half_day") === "on";

  let days: number;
  if (half) {
    days = 0.5;
  } else {
    const { data, error } = await supabase.rpc("working_days", { p_from: start_date, p_to: end_date });
    if (error) throw new Error(error.message);
    days = Number(data);
  }
  if (days <= 0) redirect("/hr/leave?error=" + encodeURIComponent("ช่วงวันที่เลือกไม่มีวันทำงาน"));

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: session.employee.id,
    leave_type: formData.get("leave_type"),
    start_date,
    end_date: half ? start_date : end_date,
    days,
    reason: (formData.get("reason") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/hr/leave");
  redirect("/hr/leave?saved=1");
}

export async function cancelLeave(id: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  revalidatePath("/hr/leave");
}

export async function reviewLeave(id: string, decision: "approved" | "rejected", formData: FormData) {
  const s = await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("leave_requests")
    .update({ status: decision, reviewed_by: s.appUser.id, reviewed_at: new Date().toISOString(), admin_note: (formData.get("admin_note") as string) || null })
    .eq("id", id);
  revalidatePath("/hr/leave");
  revalidatePath("/");
}
