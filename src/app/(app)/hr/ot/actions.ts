"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";
import { minutesBetween } from "@/lib/format";

export async function submitOt(formData: FormData) {
  const session = await getSession();
  if (!session.employee) throw new Error("บัญชีนี้ไม่ได้ผูกกับพนักงาน");
  const supabase = await createClient();

  const start = String(formData.get("start_time"));
  const end = String(formData.get("end_time"));
  const mins = minutesBetween(start, end);
  if (mins <= 0) redirect("/hr/ot?error=" + encodeURIComponent("เวลาสิ้นสุดต้องหลังเวลาเริ่ม"));

  const { error } = await supabase.from("ot_requests").insert({
    employee_id: session.employee.id,
    work_date: formData.get("work_date"),
    start_time: start,
    end_time: end,
    hours_requested: Math.round((mins / 60) * 2) / 2, // ปัดเป็นครึ่งชั่วโมง
    reason: (formData.get("reason") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/hr/ot");
  redirect("/hr/ot?saved=1");
}

export async function cancelOt(id: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("ot_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
  revalidatePath("/hr/ot");
}

export async function reviewOt(id: string, decision: "approved" | "rejected", formData: FormData) {
  const s = await requireAdmin();
  const supabase = await createClient();
  const hours = formData.get("hours_approved");
  await supabase
    .from("ot_requests")
    .update({
      status: decision,
      hours_approved: decision === "approved" ? Number(hours) : null,
      reviewed_by: s.appUser.id,
      reviewed_at: new Date().toISOString(),
      admin_note: (formData.get("admin_note") as string) || null,
    })
    .eq("id", id);
  revalidatePath("/hr/ot");
  revalidatePath("/hr");
}
