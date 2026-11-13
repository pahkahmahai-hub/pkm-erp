import { createClient } from "@supabase/supabase-js";

/** client แบบไม่มีผู้ใช้ (anon) — ใช้กับ API ที่ยืนยันตัวด้วยรหัสลับผ่าน RPC เท่านั้น */
export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
