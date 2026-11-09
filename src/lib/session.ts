import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Employee, SessionInfo } from "@/lib/types";
import { clientIp, ipAllowed, type AllowedNetwork } from "@/lib/network";

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

  // Staff may use the system only from the company's networks (admins: anywhere).
  if (appUser.role !== "admin") {
    const { data: rows } = await supabase.from("settings").select("key, value").in("key", ["allowed_networks", "network_restriction"]);
    const enabled = rows?.find((r) => r.key === "network_restriction")?.value === true;   // off unless an admin switches it on
    const list = enabled ? ((rows?.find((r) => r.key === "allowed_networks")?.value as AllowedNetwork[] | null) ?? []) : [];
    if (list.length > 0) {
      const ip = await clientIp();
      if (!ipAllowed(ip, list)) redirect(`/auth/network?ip=${encodeURIComponent(ip)}`);
    }
  }

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
  if (!s.isAdmin) redirect("/hr");
  return s;
}
