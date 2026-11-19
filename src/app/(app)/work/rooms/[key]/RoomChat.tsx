"use client";

import { useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";
import { ChatBox, type ChatMessage, type ChatMember } from "@/components/work/ChatBox";
import { postRoomMessage, deleteRoomMessage, markRoomRead, roomReadStatus, toggleRoomMute } from "../../actions";

export function RoomChat({ roomId, roomKey, initial, meId, members, names = {}, muted: muted0 = null, canPinAll = false }: {
  roomId: string; roomKey: string; initial: ChatMessage[]; meId: string; members: ChatMember[]; names?: Record<string, string>;
  muted?: boolean | null; canPinAll?: boolean;
}) {
  const [muted, setMuted] = useState(muted0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toggle = () => start(async () => { const r = await toggleRoomMute(roomId); if (r.error) setErr(r.error); else { setErr(null); setMuted(!!r.muted); } });
  return (
    <div className="space-y-2">
      {muted !== null && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm ${muted ? "bg-yellow/20 text-[#7a4a00]" : "bg-white border border-line text-ink-soft"}`}>
          {muted ? <BellOff size={16} /> : <BellRing size={16} className="text-green" />}
          <span className="flex-1 min-w-[180px]">{muted ? "ปิดเสียงห้องนี้อยู่ — ไม่เด้งทุกข้อความ แต่ถ้ามีคน @ ถึงคุณ ยังเด้งเสมอ" : "ห้องนี้เด้งทุกข้อความ"}</span>
          {err && <span className="text-red text-xs">{err}</span>}
          <button type="button" onClick={toggle} disabled={busy} className="btn-outline py-1 px-3 text-xs">{muted ? "เปิดเสียง" : "ปิดเสียงห้องนี้"}</button>
        </div>
      )}
      <ChatBox
        table="work_room_messages"
        filterColumn="room_id"
        filterValue={roomId}
        initial={initial}
        meId={meId}
        onPost={postRoomMessage.bind(null, roomId)}
        onDelete={deleteRoomMessage}
        placeholder="คุยกับทีมในห้องนี้… @ เอ่ยถึงคน"
        names={names}
        markRead={() => markRoomRead(roomId)}
        loadReads={() => roomReadStatus(roomId)}
        maxHeight="60vh"
        members={members}
        canPinAll={canPinAll}
        makeTaskHref={(m, assignee) => `/work/tasks/new?room=${roomKey}&title=${encodeURIComponent((m.body ?? "").replace(/@\S+\s?/g, "").trim().slice(0, 120) || (m.body ?? "").slice(0, 120))}&from=${m.id}${assignee ? `&assignee=${assignee}` : ""}`}
      />
    </div>
  );
}
