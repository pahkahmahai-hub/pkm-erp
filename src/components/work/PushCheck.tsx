"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, XCircle, Send, BellRing, Loader2 } from "lucide-react";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push";
import { savePushSubscription, sendTestPush } from "@/app/(app)/work/actions";

type Dev = "iphone" | "android" | "mac" | "windows" | "other";
interface Check { dev: Dev; standalone: boolean; supported: boolean; perm: NotificationPermission | "n/a"; subscribed: boolean }

/** เช็คทีละขั้นว่าเครื่องนี้พร้อมรับแจ้งเตือนเด้งไหม + ปุ่มแก้ / ส่งทดสอบ */
export function PushCheck() {
  const [c, setC] = useState<Check | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  async function load() {
    const ua = navigator.userAgent;
    const dev: Dev = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "iphone" : /android/i.test(ua) ? "android" : /macintosh/i.test(ua) ? "mac" : /windows/i.test(ua) ? "windows" : "other";
    const standalone = window.matchMedia("(display-mode: standalone)").matches || !!(navigator as unknown as { standalone?: boolean }).standalone;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let subscribed = false;
    if (supported) { try { const reg = await navigator.serviceWorker.register("/sw.js"); subscribed = !!(await reg.pushManager.getSubscription()); } catch { /* ignore */ } }
    setC({ dev, standalone, supported, perm: supported ? Notification.permission : "n/a", subscribed });
  }
  useEffect(() => { load(); }, []);

  const enable = () => start(async () => {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { await load(); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscription({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, userAgent: navigator.userAgent });
      if (r.error) setMsg(r.error);
      await load();
    } catch (e) { setMsg((e as Error).message); }
  });
  const test = () => start(async () => { const r = await sendTestPush(); setMsg(r.error ?? "ส่งแล้ว — ควรเด้งภายใน 5–10 วินาที ถ้าไม่เด้ง ดูข้อแนะนำด้านล่าง"); });

  if (!c) return <div className="card p-5 text-sm text-ink-soft flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> กำลังเช็คเครื่องนี้…</div>;
  const ios = c.dev === "iphone";
  const steps: { ok: boolean; label: string; fix?: React.ReactNode }[] = [
    ...(ios ? [{ ok: c.standalone, label: "เปิดจากไอคอนบนหน้าจอโฮม (ไม่ใช่ Safari)", fix: <>ใน Safari กดปุ่มแชร์ <b>⬆️</b> → <b>เพิ่มไปยังหน้าจอโฮม</b> → ปิด Safari แล้วเปิดระบบจากไอคอน PKM ที่หน้าจอโฮม แล้วกลับมาหน้านี้อีกครั้ง</> }] : []),
    { ok: c.supported, label: "เบราว์เซอร์รองรับแจ้งเตือนเด้ง", fix: ios ? "ต้องเปิดจากไอคอนหน้าจอโฮม และ iOS 16.4 ขึ้นไป" : "ใช้ Chrome หรือ Edge (Android ใช้ Chrome)" },
    { ok: c.perm === "granted", label: "อนุญาตให้แสดงการแจ้งเตือน", fix: c.perm === "denied"
        ? (ios ? <>ไปที่ <b>ตั้งค่า → การแจ้งเตือน → PKM</b> → เปิด “อนุญาตการแจ้งเตือน”</> : c.dev === "android" ? <>กดค้างที่ไอคอนแอป → <b>ข้อมูลแอป → การแจ้งเตือน</b> → เปิด หรือใน Chrome กดแม่กุญแจข้างช่อง URL → การแจ้งเตือน → อนุญาต</> : <>กดรูปแม่กุญแจข้างช่อง URL → <b>การแจ้งเตือน → อนุญาต</b> แล้วรีเฟรช · Windows: เช็ค <b>Settings → System → Notifications → Google Chrome</b> ต้องเปิดอยู่</>)
        : "กดปุ่ม “เปิดแจ้งเตือน” ด้านล่าง แล้วเลือก อนุญาต" },
    { ok: c.subscribed, label: "เครื่องนี้ลงทะเบียนรับแจ้งเตือนแล้ว", fix: "กดปุ่ม “เปิดแจ้งเตือน” ด้านล่าง" },
  ];
  const allOk = steps.every((s) => s.ok);
  return (
    <div className={`card p-5 space-y-4 ${allOk ? "" : "border-red/40"}`}>
      <div className="flex items-center gap-2 font-display font-bold text-lg">
        {allOk ? <CheckCircle2 className="text-green" /> : <XCircle className="text-red" />}
        {allOk ? "เครื่องนี้พร้อมรับแจ้งเตือนเด้งแล้ว" : "เครื่องนี้ยังไม่เด้ง — ทำตามขั้นที่มี ✗"}
        <span className="ml-auto text-xs font-normal text-ink-soft">{({ iphone: "iPhone / iPad", android: "Android", mac: "Mac", windows: "Windows", other: "อุปกรณ์อื่น" })[c.dev]}</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className={`rounded-xl px-3 py-2 text-sm ${s.ok ? "bg-green/10" : "bg-red/10"}`}>
            <div className="flex items-center gap-2 font-semibold">{s.ok ? <CheckCircle2 size={16} className="text-green" /> : <XCircle size={16} className="text-red" />} {i + 1}. {s.label}</div>
            {!s.ok && s.fix && <div className="mt-1 pl-6 text-ink-soft">{s.fix}</div>}
          </li>
        ))}
      </ol>
      {msg && <div className="text-sm text-purple">{msg}</div>}
      <div className="flex flex-wrap gap-2">
        {c.supported && (!c.subscribed || c.perm !== "granted") && c.perm !== "denied" && <button type="button" onClick={enable} disabled={busy} className="btn-primary"><BellRing size={16} /> เปิดแจ้งเตือน</button>}
        {c.subscribed && <button type="button" onClick={test} disabled={busy} className="btn-base bg-green text-white"><Send size={16} /> ส่งแจ้งเตือนทดสอบ</button>}
        <button type="button" onClick={() => load()} className="btn-outline">เช็คใหม่</button>
      </div>
      <details className="text-xs text-ink-soft">
        <summary className="cursor-pointer font-semibold">กดทดสอบแล้วยังไม่เด้ง?</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>ปิดโหมด <b>ห้ามรบกวน / โฟกัส</b> ของมือถือหรือคอม</li>
          <li>Android: ปิด <b>โหมดประหยัดแบตเตอรี่</b> สำหรับ Chrome/แอป PKM</li>
          <li>คอม: ต้องเปิด Chrome ทิ้งไว้ (ย่อหน้าต่างได้) ถ้าปิด Chrome หมดจะไม่เด้ง</li>
          <li>ต้องเปิดแยกทีละเครื่อง — คอมกับมือถือคนละเครื่องกัน</li>
        </ul>
      </details>
    </div>
  );
}
