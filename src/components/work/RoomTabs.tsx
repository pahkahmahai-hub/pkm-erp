import Link from "next/link";
import { MessageCircle, ListChecks, Truck, CalendarDays, CalendarRange, StickyNote, Images } from "lucide-react";

export type RoomTab = "tasks" | "chat" | "calendar" | "notes" | "gallery";

/** แท็บของทุกห้องในเมนูงาน */
export function RoomTabs({ roomKey, tab }: { roomKey: string; tab: RoomTab | string }) {
  const cls = (on: boolean) => (on ? "btn-primary py-1.5 px-4" : "btn-outline py-1.5 px-4");
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/work/rooms/${roomKey}`} className={cls(tab === "tasks")}><ListChecks size={16} /> งาน</Link>
      <Link href={`/work/rooms/${roomKey}?tab=chat`} className={cls(tab === "chat")}><MessageCircle size={16} /> แชทห้อง</Link>
      <Link href={`/work/rooms/${roomKey}/notes`} className={cls(tab === "notes")}><StickyNote size={16} /> โน้ต</Link>
      <Link href={`/work/rooms/${roomKey}/gallery`} className={cls(tab === "gallery")}><Images size={16} /> แกลเลอรี</Link>
      <Link href={`/work/rooms/${roomKey}/calendar`} className={cls(tab === "calendar")}><CalendarDays size={16} /> ปฏิทิน{roomKey === "teamwork" ? "ทีม" : ""}</Link>
      {roomKey === "teamwork" && <Link href="/work/company-calendar" className={cls(false)}><CalendarRange size={16} /> ปฏิทินบริษัท</Link>}
      {roomKey === "sw-room" && <Link href="/work/deliveries" className={cls(false)}><Truck size={16} /> ตารางส่งห้าง</Link>}
    </div>
  );
}
