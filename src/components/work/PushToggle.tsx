"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, BellOff, Send } from "lucide-react";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push";
import { savePushSubscription, removePushSubscription, sendTestPush } from "@/app/(app)/work/actions";

type State = "loading" | "unsupported" | "ios-needs-install" | "denied" | "off" | "on";

/** เปิด/ปิดแจ้งเตือนเด้งบนเครื่องนี้ (คอม / มือถือ) — แยกทีละเครื่อง */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState(ios && !standalone ? "ios-needs-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () => start(async () => {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscription({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, userAgent: navigator.userAgent });
      if (r.error) { setMsg(r.error.includes("push_subscriptions") ? "ยังไม่ได้รัน SQL 0026" : r.error); return; }
      setState("on"); setMsg("เปิดแล้ว — ลองกด \"ส่งทดสอบ\"");
    } catch (e) { setMsg((e as Error).message); }
  });
  const disable = () => start(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState("off"); setMsg(null);
  });
  const test = () => start(async () => { const r = await sendTestPush(); setMsg(r.error ?? "ส่งแล้ว — ควรเด้งภายในไม่กี่วินาที"); });

  if (state === "loading") return null;
  if (compact && state === "on") return null;
  return (
    <div className={`card p-4 flex flex-wrap items-center gap-3 ${state === "on" ? "" : "border-purple/40 bg-lavender/20"}`}>
      {state === "on" ? <BellRing size={20} className="text-green" /> : <BellOff size={20} className="text-purple" />}
      <div className="flex-1 min-w-[220px] text-sm">
        <div className="font-semibold">แจ้งเตือนเด้งบนเครื่องนี้ {state === "on" ? "— เปิดอยู่" : ""}</div>
        <div className="text-xs text-ink-soft">
          {state === "on" && "ถูกมอบหมายงาน ถูก @ ในแชท หรืองานถูกตรวจ/ตีกลับ จะเด้งที่มุมจอแม้ไม่ได้เปิดหน้าระบบ (ต้องเปิดเบราว์เซอร์ไว้)"}
          {state === "off" && "เปิดเพื่อให้แจ้งเตือนเด้งบนคอม/มือถือเครื่องนี้ — ต้องเปิดแยกทีละเครื่อง"}
          {state === "denied" && "เบราว์เซอร์บล็อกการแจ้งเตือนของเว็บนี้ไว้ — กดรูปแม่กุญแจข้างช่อง URL → การแจ้งเตือน → อนุญาต แล้วรีเฟรช"}
          {state === "ios-needs-install" && "iPhone/iPad: กดปุ่มแชร์ใน Safari → \"เพิ่มไปยังหน้าจอโฮม\" แล้วเปิดระบบจากไอคอนนั้น จึงจะเปิดแจ้งเตือนได้"}
          {state === "unsupported" && "เบราว์เซอร์นี้ไม่รองรับแจ้งเตือนเด้ง — ใช้ Chrome หรือ Edge"}
        </div>
        {msg && <div className="text-xs text-purple mt-1">{msg}</div>}
      </div>
      {state === "off" && <button type="button" onClick={enable} disabled={busy} className="btn-primary py-1.5"><BellRing size={14} /> เปิดแจ้งเตือน</button>}
      {state === "on" && <><button type="button" onClick={test} disabled={busy} className="btn-outline py-1.5"><Send size={14} /> ส่งทดสอบ</button><button type="button" onClick={disable} disabled={busy} className="btn-outline py-1.5 !text-ink-soft">ปิดบนเครื่องนี้</button></>}
    </div>
  );
}
