"use client";

import { ChatBox, type ChatMessage, type ChatMember } from "@/components/work/ChatBox";
import { postRoomMessage, deleteRoomMessage, markRoomRead, roomReadStatus } from "../../actions";

export function RoomChat({ roomId, roomKey, initial, meId, members }: { roomId: string; roomKey: string; initial: ChatMessage[]; meId: string; members: ChatMember[] }) {
  return (
    <ChatBox
      table="work_room_messages"
      filterColumn="room_id"
      filterValue={roomId}
      initial={initial}
      meId={meId}
      onPost={postRoomMessage.bind(null, roomId)}
      onDelete={deleteRoomMessage}
      placeholder="คุยกับทีมในห้องนี้… @ เอ่ยถึงคน"
      markRead={() => markRoomRead(roomId)}
      loadReads={() => roomReadStatus(roomId)}
      maxHeight="60vh"
      members={members}
      makeTaskHref={(m, assignee) => `/work/tasks/new?room=${roomKey}&title=${encodeURIComponent((m.body ?? "").replace(/@\S+\s?/g, "").trim().slice(0, 120) || (m.body ?? "").slice(0, 120))}&from=${m.id}${assignee ? `&assignee=${assignee}` : ""}`}
    />
  );
}
