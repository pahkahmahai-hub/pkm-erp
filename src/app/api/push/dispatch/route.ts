import { NextResponse } from "next/server";
import webpush from "web-push";
import { anonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Sub { endpoint: string; p256dh: string; auth: string }
interface Body { secret?: string; subscriptions?: Sub[]; title?: string; body?: string; url?: string; tag?: string }

/** เรียกจาก trigger ในฐานข้อมูล (pg_net) ทุกครั้งที่มีแจ้งเตือนใหม่ → ส่ง Web Push ไปทุกเครื่องของผู้รับ */
export async function POST(req: Request) {
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!b.secret || !Array.isArray(b.subscriptions)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = anonClient();
  const { data: cfg, error } = await supabase.rpc("push_config", { p_secret: b.secret });   // ยืนยันรหัส + ได้กุญแจ VAPID
  if (error || !cfg) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { public_key, private_key, subject } = cfg as { public_key: string; private_key: string; subject: string };
  webpush.setVapidDetails(subject, public_key, private_key);

  const payload = JSON.stringify({ title: b.title ?? "PKM ERP", body: b.body ?? "", url: b.url ?? "/work/notifications", tag: b.tag });
  const dead: string[] = [], ok: string[] = [];
  await Promise.all(b.subscriptions.slice(0, 20).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "high" });
      ok.push(s.endpoint);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);   // เครื่องยกเลิก/หมดอายุ → ลบทิ้ง
    }
  }));
  if (dead.length || ok.length) await supabase.rpc("push_prune", { p_secret: b.secret, p_dead: dead, p_ok: ok });
  return NextResponse.json({ sent: ok.length, removed: dead.length });
}
