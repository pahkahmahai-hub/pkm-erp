"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";

const nul = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

export async function createEmployee(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const team_id = Number(formData.get("team_id"));
  const start_date = nul(formData.get("start_date"));
  let emp_code = nul(formData.get("emp_code"));

  if (!emp_code) {
    const { data, error } = await supabase.rpc("next_employee_code", { p_team_id: team_id, p_start_date: start_date });
    if (error) throw new Error(error.message);
    emp_code = data as string;
  }

  const email = nul(formData.get("email"))?.toLowerCase() ?? null;
  const { data: emp, error } = await supabase
    .from("employees")
    .insert({
      emp_code,
      title: nul(formData.get("title")),
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      nickname: nul(formData.get("nickname")),
      team_id,
      position: nul(formData.get("position")),
      email,
      phone: nul(formData.get("phone")),
      birth_date: nul(formData.get("birth_date")),
      address: nul(formData.get("address")),
      start_date,
      status: formData.get("status") ?? "probation",
      notes: nul(formData.get("notes")),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // auto-create a login account for the new employee
  if (email && formData.get("create_login") === "on") {
    await supabase.from("app_users").insert({ email, role: "staff", employee_id: emp.id, display_name: formData.get("first_name") });
  }

  revalidatePath("/hr/employees");
  redirect(`/hr/employees/${emp.id}`);
}

export async function updateEmployee(id: string, formData: FormData) {
  const session = await getSession();
  const supabase = await createClient();

  const isSelf = session.employee?.id === id;
  if (!session.isAdmin && !isSelf) throw new Error("ไม่มีสิทธิ์");

  // staff may edit only their own contact info
  const selfFields = {
    nickname: nul(formData.get("nickname")),
    phone: nul(formData.get("phone")),
    address: nul(formData.get("address")),
  };

  const adminFields = session.isAdmin
    ? {
        emp_code: formData.get("emp_code"),
        title: nul(formData.get("title")),
        first_name: formData.get("first_name"),
        last_name: formData.get("last_name"),
        team_id: Number(formData.get("team_id")) || null,
        position: nul(formData.get("position")),
        email: nul(formData.get("email"))?.toLowerCase() ?? null,
        birth_date: nul(formData.get("birth_date")),
        start_date: nul(formData.get("start_date")),
        end_date: nul(formData.get("end_date")),
        status: formData.get("status"),
        needs_review: formData.get("needs_review") === "on",
        review_note: nul(formData.get("review_note")),
        notes: nul(formData.get("notes")),
      }
    : {};

  const { error } = await supabase.from("employees").update({ ...selfFields, ...adminFields }).eq("id", id);
  if (error) throw new Error(error.message);

  // keep the login email in sync
  if (session.isAdmin && adminFields.email) {
    await supabase.from("app_users").update({ email: adminFields.email }).eq("employee_id", id);
  }

  revalidatePath("/hr/employees");
  revalidatePath(`/hr/employees/${id}`);
  redirect(`/hr/employees/${id}?saved=1`);
}

export async function ensureLogin(employeeId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("email, first_name").eq("id", employeeId).single();
  if (!e?.email) throw new Error("พนักงานยังไม่มีอีเมล");
  await supabase.from("app_users").upsert({ email: e.email.toLowerCase(), role: "staff", employee_id: employeeId, display_name: e.first_name, is_active: true }, { onConflict: "email" });
  revalidatePath(`/hr/employees/${employeeId}`);
}

export async function setLoginActive(employeeId: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("app_users").update({ is_active: active }).eq("employee_id", employeeId);
  revalidatePath(`/hr/employees/${employeeId}`);
}
