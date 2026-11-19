"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { badgeCount } from "@/app/(app)/work/unread-actions";

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** เลขแดงบนไอคอนแอป (มือถือ/คอมที่ติดตั้งแอปไว้) = แจ้งเตือน + แชทห้องที่ยังไม่อ่าน */
export function BadgeSync() {
  const pathname = usePathname();
  useEffect(() => {
    const nav = navigator as BadgeNav;
    if (!nav.setAppBadge) return;
    let alive = true;
    const sync = () => badgeCount().then((n) => {
      if (!alive) return;
      (n > 0 ? nav.setAppBadge!(n) : nav.clearAppBadge?.() ?? nav.setAppBadge!(0)).catch(() => {});
    }).catch(() => {});
    sync();
    const t = setInterval(() => { if (document.visibilityState === "visible") sync(); }, 60000);
    const onVis = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [pathname]);
  return null;
}
