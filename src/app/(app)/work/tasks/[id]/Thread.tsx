"use client";

import { ChatBox, type ChatMessage, type ChatMember } from "@/components/work/ChatBox";
import { postComment, deleteComment, markTaskRead, taskReadStatus } from "../../actions";

export function Thread({ taskId, initial, meId, members = [] }: { taskId: string; initial: ChatMessage[]; meId: string; members?: ChatMember[] }) {
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
      placeholder="คุยเรื่องงานนี้… @ เอ่ยถึงคน · แนบรูปผลงานได้"
      members={members}
      markRead={() => markTaskRead(taskId)}
      loadReads={() => taskReadStatus(taskId)}
    />
  );
}
