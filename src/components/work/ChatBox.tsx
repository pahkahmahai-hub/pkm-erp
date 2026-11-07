"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Paperclip, Send, Download, Trash2, ListPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { fmtDateTime } from "@/lib/format";
import { fetchNewer } from "@/app/(app)/work/actions";

export interface ChatMessage {
  id: string; author_id: string | null; body: string | null; image_url: string | null; file_url: string | null; file_name: string | null;
  kind?: string; task_id?: string | null; created_at: string;
  app_users?: { display_name: string | null; email: string } | null;
}

export function ChatBox({
  table, filterColumn, filterValue, initial, meId, onPost, onDelete, title, placeholder, makeTaskHref, maxHeight = "480px",
}: {
  table: "work_comments" | "work_room_messages"; filterColumn: "task_id" | "room_id"; filterValue: string; initial: ChatMessage[]; meId: string;
  onPost: (fd: FormData) => Promise<{ error?: string; row?: Record<string, unknown> }>;
  onDelete: (id: string) => Promise<void>;
  title?: string; placeholder?: string;
  makeTaskHref?: (m: ChatMessage) => string;   // "เปลี่ยนเป็นงาน"
  maxHeight?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function addMessages(rows: ChatMessage[]) {
    if (!rows.length) return;
    setMessages((c) => {
      const ids = new Set(c.map((x) => x.id));
      const fresh = rows.filter((r) => !ids.has(r.id));
      return fresh.length ? [...c, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at)) : c;
    });
  }
  const lastRef = useRef<string>(initial.length ? initial[initial.length - 1].created_at : new Date(0).toISOString());
  useEffect(() => { if (messages.length) lastRef.current = messages[messages.length - 1].created_at; }, [messages]);

  // polling fallback (every 4s) — works even when realtime is blocked
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const rows = (await fetchNewer(table, filterColumn, filterValue, lastRef.current)) as unknown as ChatMessage[];
        if (alive) addMessages(rows);
      } catch { /* ignore */ }
    };
    const t = setInterval(tick, 4000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [table, filterColumn, filterValue]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`${table}-${filterValue}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `${filterColumn}=eq.${filterValue}` }, async (payload) => {
        const row = payload.new as ChatMessage;
        const { data } = await supabase.from("app_users").select("display_name, email").eq("id", row.author_id ?? "").maybeSingle();
        addMessages([{ ...row, app_users: data ?? null }]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `${filterColumn}=eq.${filterValue}` }, (payload) => {
        const row = payload.new as ChatMessage;
        setMessages((c) => c.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table }, (payload) => {
        setMessages((c) => c.filter((x) => x.id !== (payload.old as { id: string }).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [table, filterColumn, filterValue]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

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
      const res = await onPost(fd);
      if (res.error) { setErr(res.error); return; }
      if (res.row) addMessages([res.row as unknown as ChatMessage]);
      setBody(""); setFile(null); setPreview(null);
    });
  }

  return (
    <div className="card p-5 flex flex-col">
      {title && <h2 className="font-display font-bold mb-3">{title}</h2>}
      <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight }}>
        {messages.map((m) => {
          const mine = m.author_id === meId;
          if (m.kind === "status") return <div key={m.id} className="text-center text-[11px] text-ink-soft"><span className="bg-cream px-2 py-0.5 rounded-full">{m.app_users?.display_name ?? ""} · {m.body} · {fmtDateTime(m.created_at)}</span></div>;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bg-purple text-white rounded-br-sm" : "bg-cream rounded-bl-sm"}`}>
                {!mine && <div className="text-[11px] font-semibold opacity-70 mb-0.5">{m.app_users?.display_name ?? m.app_users?.email}</div>}
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                {m.image_url && <a href={m.image_url} target="_blank" rel="noopener" download>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.image_url} alt="" className="mt-1 rounded-xl max-h-72 object-cover" /></a>}
                {m.file_url && <a href={m.file_url} target="_blank" rel="noopener" download className={`mt-1 flex items-center gap-2 underline ${mine ? "text-white" : "text-purple"}`}><Download size={14} /> {m.file_name ?? "ไฟล์แนบ"}</a>}
                <div className={`text-[10px] mt-1 flex items-center gap-3 ${mine ? "text-white/70" : "text-ink-soft"}`}>
                  <span>{fmtDateTime(m.created_at)}</span>
                  {m.task_id ? <a href={`/work/tasks/${m.task_id}`} className="underline">→ งาน</a> : makeTaskHref && <a href={makeTaskHref(m)} className="flex items-center gap-1 underline" title="เปลี่ยนเป็นงาน"><ListPlus size={11} /> เป็นงาน</a>}
                  {mine && <button onClick={() => start(() => onDelete(m.id))} className="hover:text-red" title="ลบ"><Trash2 size={11} /></button>}
                </div>
              </div>
            </div>
          );
        })}
        {!messages.length && <div className="text-center text-ink-soft text-sm py-6">ยังไม่มีข้อความ</div>}
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
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} className="input resize-none" rows={1} placeholder={placeholder ?? "พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)"} />
          <button type="button" onClick={send} disabled={pending || (!body.trim() && !file)} className="btn-primary px-3.5"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
