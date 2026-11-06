import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Employee, SessionInfo } from "@/lib/types";

/** Loads the signed-in Google user + the allowlisted app_user row. Redirects if not allowed. */
export const getSession = cache(async (): Promise<SessionInfo> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!appUser) redirect("/auth/denied");

  let employee: Employee | null = null;
  if (appUser.employee_id) {
    const { data } = await supabase
      .from("employees")
      .select("*, teams(*)")
      .eq("id", appUser.employee_id)
      .maybeSingle();
    employee = data as Employee | null;
  }

  return {
    authUser: {
      id: user.id,
      email: user.email ?? "",
      name: (user.user_metadata?.full_name as string) ?? null,
      avatar: (user.user_metadata?.avatar_url as string) ?? null,
    },
    appUser: appUser as AppUser,
    employee,
    isAdmin: appUser.role === "admin",
  };
});

export async function requireAdmin() {
  const s = await getSession();
  if (!s.isAdmin) redirect("/");
  return s;
}
