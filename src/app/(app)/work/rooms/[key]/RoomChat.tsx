"use client";

import { ChatBox, type ChatMessage } from "@/components/work/ChatBox";
import { postRoomMessage, deleteRoomMessage } from "../../actions";

export function RoomChat({ roomId, roomKey, initial, meId }: { roomId: string; roomKey: string; initial: ChatMessage[]; meId: string }) {
  return (
    <ChatBox
      table="work_room_messages"
      filterColumn="room_id"
      filterValue={roomId}
      initial={initial}
      meId={meId}
      onPost={postRoomMessage.bind(null, roomId)}
      onDelete={deleteRoomMessage}
      placeholder="คุยกับทีมในห้องนี้… (Enter ส่ง)"
      maxHeight="60vh"
      makeTaskHref={(m) => `/work/tasks/new?room=${roomKey}&title=${encodeURIComponent((m.body ?? "").slice(0, 120))}&from=${m.id}`}
    />
  );
}
