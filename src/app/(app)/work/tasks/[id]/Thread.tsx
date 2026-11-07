"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Paperclip, Send, Download, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { fmtDateTime } from "@/lib/format";
import { postComment, deleteComment } from "../../actions";
import type { Comment } from "@/lib/work/types";

export function Thread({ taskId, initial, meId }: { taskId: string; initial: Comment[]; meId: string }) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // realtime: new comments from anyone appear instantly
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`task-${taskId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_comments", filter: `task_id=eq.${taskId}` }, async (payload) => {
        const row = payload.new as Comment;
        const { data } = await supabase.from("app_users").select("display_name, email").eq("id", row.author_id ?? "").maybeSingle();
        setComments((c) => (c.some((x) => x.id === row.id) ? c : [...c, { ...row, app_users: data ?? null }]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "work_comments" }, (payload) => {
        setComments((c) => c.filter((x) => x.id !== (payload.old as { id: string }).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [taskId]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [comments.length]);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  function send() {
    if (!body.trim() && !file) return;
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("body", body);
      if (file) fd.set("file", file.type.startsWith("image/") ? await compressImage(file) : file);
      const res = await postComment(taskId, fd);
      if (res.error) { setErr(res.error); return; }
      setBody(""); setFile(null); setPreview(null);
    });
  }

  return (
    <div className="card p-5">
      <h2 className="font-display font-bold mb-3">คอมเมนต์</h2>
      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
        {comments.map((c) => {
          const mine = c.author_id === meId;
          if (c.kind === "status") return <div key={c.id} className="text-center text-[11px] text-ink-soft"><span className="bg-cream px-2 py-0.5 rounded-full">{c.app_users?.display_name ?? ""} · {c.body} · {fmtDateTime(c.created_at)}</span></div>;
          return (
            <div key={c.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bg-purple text-white rounded-br-sm" : "bg-cream rounded-bl-sm"}`}>
                {!mine && <div className="text-[11px] font-semibold opacity-70 mb-0.5">{c.app_users?.display_name ?? c.app_users?.email}</div>}
                {c.body && <div className="whitespace-pre-wrap">{c.body}</div>}
                {c.image_url && <a href={c.image_url} target="_blank" rel="noopener" download>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.image_url} alt="" className="mt-1 rounded-xl max-h-72 object-cover" /></a>}
                {c.file_url && <a href={c.file_url} target="_blank" rel="noopener" download className={`mt-1 flex items-center gap-2 underline ${mine ? "text-white" : "text-purple"}`}><Download size={14} /> {c.file_name ?? "ไฟล์แนบ"}</a>}
                <div className={`text-[10px] mt-1 flex items-center gap-2 ${mine ? "text-white/70" : "text-ink-soft"}`}>
                  {fmtDateTime(c.created_at)}
                  {mine && <button onClick={() => start(() => deleteComment(c.id, taskId))} className="hover:text-red" title="ลบ"><Trash2 size={11} /></button>}
                </div>
              </div>
            </div>
          );
        })}
        {!comments.length && <div className="text-center text-ink-soft text-sm py-6">ยังไม่มีข้อความ — คุยเรื่องงานนี้ได้ที่นี่ แนบรูปได้</div>}
        <div ref={bottom} />
      </div>

      <div className="mt-4 border-t border-line pt-3 space-y-2">
        {preview && <div className="relative inline-block">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="" className="h-24 rounded-xl object-cover" /><button onClick={() => { setFile(null); setPreview(null); }} className="absolute -top-2 -right-2 bg-red text-white rounded-full h-6 w-6 text-xs">✕</button></div>}
        {file && !preview && <div className="text-xs flex items-center gap-2"><Paperclip size={12} /> {file.name} <button onClick={() => setFile(null)} className="text-red">ลบ</button></div>}
        {err && <div className="text-xs text-red">{err}</div>}
        <div className="flex gap-2 items-end">
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => imgRef.current?.click()} className="btn-ghost px-2.5" title="แนบรูป"><ImageIcon size={18} /></button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-2.5" title="แนบไฟล์"><Paperclip size={18} /></button>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="input resize-none" rows={1} placeholder="พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)" />
          <button type="button" onClick={send} disabled={pending || (!body.trim() && !file)} className="btn-primary px-3.5"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
