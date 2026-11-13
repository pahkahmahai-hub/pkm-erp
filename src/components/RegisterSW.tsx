"use client";
import { useEffect } from "react";
/** ลงทะเบียน service worker ทุกหน้า (แจ้งเตือนเด้ง + รับรูปที่แชร์มาจากแอปอื่น) */
export function RegisterSW() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return null;
}
