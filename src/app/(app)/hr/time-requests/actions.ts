"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };

export async function submitTimeRequest(formData: FormData) {
  const session = await getSession();
  if (!session.employee) throw new Error("บัญชีนี้ไม่ได้ผูกกับพนักงาน");
  const supabase = await createClient();
  const requested_in = nul(formData.get("requested_in"));
  const requested_out = nul(formData.get("requested_out"));
  if (!requested_in && !requested_out) redirect("/hr/time-requests?error=" + encodeURIComponent("ต้องระบุเวลาเข้าหรือเวลาออกอย่างน้อย 1 ช่อง"));
  const { error } = await supabase.from("attendance_requests").insert({
    employee_id: session.employee.id,
    work_date: formData.get("work_date"),
    requested_in, requested_out,
    reason: nul(formData.get("reason")) ?? "",
  });
  if (error) redirect("/hr/time-requests?error=" + encodeURIComponent(error.message));
  revalidatePath("/hr/time-requests");
  redirect("/hr/time-requests?saved=1");
}

export async function cancelTimeRequest(id: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("attendance_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  revalidatePath("/hr/time-requests");
}

export async function reviewTimeRequest(id: string, decision: "approved" | "rejected", formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_attendance_request", { p_id: id, p_decision: decision, p_note: nul(formData.get("admin_note")) });
  if (error) redirect("/hr/time-requests?error=" + encodeURIComponent(error.message));
  revalidatePath("/hr/time-requests");
  revalidatePath("/hr/attendance");
  revalidatePath("/hr");
}
