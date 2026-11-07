"use client";

import { ChatBox, type ChatMessage } from "@/components/work/ChatBox";
import { postComment, deleteComment } from "../../actions";

export function Thread({ taskId, initial, meId }: { taskId: string; initial: ChatMessage[]; meId: string }) {
  return (
    <ChatBox
      table="work_comments"
      filterColumn="task_id"
      filterValue={taskId}
      initial={initial}
      meId={meId}
      onPost={postComment.bind(null, taskId)}
      onDelete={(id) => deleteComment(id, taskId)}
      title="คอมเมนต์"
      placeholder="คุยเรื่องงานนี้… แนบรูปผลงานได้ (Enter ส่ง)"
    />
  );
}
