"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { myRoomUnread, type RoomUnread } from "@/app/(app)/work/unread-actions";

/** ทางลัดแชทห้อง (เฉพาะห้องที่เป็นสมาชิก) + ตัวเลขข้อความที่ยังไม่อ่าน — โชว์ในเมนูข้างของหน้า WORK */
export function RoomChatShortcuts({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [rooms, setRooms] = useState<RoomUnread[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => { myRoomUnread().then((r) => { if (alive) setRooms(r); }).catch(() => {}); };
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [pathname, sp]);
  if (!rooms?.length) return null;
  const total = rooms.reduce((a, r) => a + r.unread, 0);
  return (
    <div>
      <div className="px-3 mb-2 text-[11px] font-semibold tracking-[0.14em] text-lavender uppercase flex items-center gap-2">แชทห้อง{total > 0 && <span className="rounded-full bg-red text-white px-1.5 text-[10px] tracking-normal">{total > 99 ? "99+" : total}</span>}</div>
      <ul className="space-y-0.5">
        {rooms.map((r) => {
          const active = pathname === `/work/rooms/${r.key}` && sp.get("tab") === "chat";
          return (
            <li key={r.key}>
              <Link href={`/work/rooms/${r.key}?tab=chat`} onClick={onNavigate}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-white/15 text-white font-semibold" : "text-lavender hover:bg-white/10 hover:text-white"} ${r.unread ? "font-semibold text-white" : ""}`}>
                <span className="h-6 w-6 shrink-0 rounded-lg grid place-items-center text-white text-[11px] font-bold" style={{ background: r.color }}>{r.name.slice(0, 1)}</span>
                <span className="truncate flex-1">{r.name}</span>
                {r.unread > 0 ? <span className="min-w-[20px] h-5 px-1 rounded-full bg-red text-white text-[11px] font-bold grid place-items-center">{r.unread > 99 ? "99+" : r.unread}</span> : <MessageCircle size={13} className="opacity-40" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
