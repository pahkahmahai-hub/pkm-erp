"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, AtSign } from "lucide-react";
import { myNotifCount } from "@/app/(app)/work/unread-actions";
import { TaskSearchBox } from "./TaskSearchBox";

/** แถบบนสุดของทุกหน้าใน WORK: ค้นหางาน + ปุ่มแจ้งเตือน (ตัวเลขอัปเดตเองทุก 20 วิ) */
export function WorkTopBar() {
  const pathname = usePathname();
  const [n, setN] = useState({ all: 0, mentions: 0 });
  useEffect(() => {
    let alive = true;
    const load = () => myNotifCount().then((r) => { if (alive) setN(r); }).catch(() => {});
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [pathname]);
  const onNotif = pathname.startsWith("/work/notifications");
  return (
    <div className="flex items-center justify-end gap-2 mb-4">
      <TaskSearchBox className="w-full max-w-[16rem]" />
      {n.mentions > 0 && (
        <Link href="/work/notifications?tab=mentions" className="btn-outline py-1.5 px-3 relative !border-red/50 !text-red" title="มีคน @ ถึงคุณ">
          <AtSign size={16} /><span className="hidden sm:inline">เรียกฉัน</span>
          <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-red text-white text-[11px] font-bold grid place-items-center">{n.mentions > 99 ? "99+" : n.mentions}</span>
        </Link>
      )}
      <Link href="/work/notifications" className={`${n.all || onNotif ? "btn-primary" : "btn-outline"} py-1.5 px-4 relative shrink-0`} title="แจ้งเตือน">
        <Bell size={16} /> <span className="hidden sm:inline">แจ้งเตือน</span>
        {n.all > 0 && <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-red text-white text-[11px] font-bold grid place-items-center">{n.all > 99 ? "99+" : n.all}</span>}
      </Link>
    </div>
  );
}
