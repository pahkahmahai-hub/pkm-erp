import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // allowlist check: must exist in app_users
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: appUser } = await supabase
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user?.id ?? "")
        .maybeSingle();
      if (!appUser) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/auth/denied?email=${encodeURIComponent(user?.email ?? "")}`);
      }
      await supabase.from("app_users").update({ last_login_at: new Date().toISOString() }).eq("id", appUser.id);
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่")}`);
}
