"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Paperclip, Send, Download, Trash2, ListPlus, Reply, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadChatFile, CHAT_MAX_BYTES } from "@/lib/work/upload";
import { fmtDateTime } from "@/lib/format";
import { fetchNewer } from "@/app/(app)/work/actions";

export interface ChatMember { employee_id: string; label: string; first_name: string }
export interface ChatMessage {
  id: string; author_id: string | null; body: string | null; image_url: string | null; file_url: string | null; file_name: string | null;
  kind?: string; task_id?: string | null; mentions?: string[] | null; reply_to?: string | null; created_at: string;
  app_users?: { display_name: string | null; email: string } | null;
}

export function ChatBox({
  table, filterColumn, filterValue, initial, meId, onPost, onDelete, title, placeholder, makeTaskHref, maxHeight = "480px", members = [],
}: {
  table: "work_comments" | "work_room_messages"; filterColumn: "task_id" | "room_id"; filterValue: string; initial: ChatMessage[]; meId: string;
  onPost: (fd: FormData) => Promise<{ error?: string; row?: Record<string, unknown> }>;
  onDelete: (id: string) => Promise<void>;
  title?: string; placeholder?: string;
  makeTaskHref?: (m: ChatMessage, assignee?: string) => string;   // "เปลี่ยนเป็นงาน" (assignee = employee id ที่ถูก @)
  maxHeight?: string;
  members?: ChatMember[];                          // สำหรับ @mention
}) {
  const [mentionQ, setMentionQ] = useState<string | null>(null);   // text after the "@" being typed
  const [mentionIdx, setMentionIdx] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mentionResults = mentionQ === null ? [] : members.filter((m) => m.label.toLowerCase().includes(mentionQ.toLowerCase()) || m.first_name.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 6);
  function onBodyChange(v: string) {
    setBody(v);
    const el = taRef.current; const pos = el ? el.selectionStart : v.length;
    const before = v.slice(0, pos); const at = before.lastIndexOf("@");
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1])) && !/\s/.test(before.slice(at + 1))) { setMentionQ(before.slice(at + 1)); setMentionIdx(0); } else setMentionQ(null);
  }
  function insertMention(m: ChatMember) {
    const el = taRef.current; const pos = el ? el.selectionStart : body.length;
    const before = body.slice(0, pos); const at = before.lastIndexOf("@");
    const next = `${body.slice(0, at)}@${m.label} ${body.slice(pos)}`;
    setBody(next); setMentionQ(null);
    requestAnimationFrame(() => { if (el) { el.focus(); const p = at + m.label.length + 2; el.setSelectionRange(p, p); } });
  }
  const mentionedIds = (text: string) => members.filter((m) => text.includes(`@${m.label}`)).map((m) => m.employee_id);
  const labelOf = (empId: string) => members.find((m) => m.employee_id === empId)?.label ?? "";
  const renderBody = (text: string) => {
    const labels = members.map((m) => m.label).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!labels.length) return text;
    const re = new RegExp(`(@(?:${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
    return text.split(re).map((part, i) => (part.startsWith("@") && labels.includes(part.slice(1)) ? <mark key={i} className="bg-yellow/40 text-inherit rounded px-0.5 font-semibold">{part}</mark> : part));
  };
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [dragging, setDragging] = useState(false);
  const nameOf = (m: ChatMessage | undefined) => (m ? (m.author_id === meId ? "คุณ" : m.app_users?.display_name ?? m.app_users?.email ?? "") : "");
  const snippet = (m: ChatMessage | undefined) => (m ? (m.body?.slice(0, 80) || (m.image_url ? "📷 รูปภาพ" : m.file_name ? "📎 " + m.file_name : "")) : "ข้อความก่อนหน้า");
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
    // รูปจะถูกย่อก่อนส่ง จึงตรวจขนาดตอนส่ง · ไฟล์อื่นตรวจทันที
    if (!f.type.startsWith("image/") && f.size > CHAT_MAX_BYTES) { setErr(`ไฟล์ "${f.name}" ใหญ่ ${(f.size / 1024 / 1024).toFixed(1)} MB — ส่งได้ไม่เกิน 5 MB ต่อไฟล์`); return; }
    setErr(null);
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }
  function send() {
    if (!body.trim() && !file) return;
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("body", body);
      fd.set("mentions", JSON.stringify(mentionedIds(body)));
      if (file) {
        // อัปโหลดจากเบราว์เซอร์ตรงไป storage (ไม่ผ่าน server action ซึ่งรับได้ ~1 MB) แล้วส่งแค่ลิงก์
        try {
          const up = await uploadChatFile(`chat/${filterValue}`, file);
          fd.set("uploaded_url", up.url); fd.set("uploaded_name", up.name); fd.set("uploaded_is_image", up.is_image ? "1" : "0");
        } catch (e) { setErr((e as Error).message); return; }
      }
      if (replyTo) fd.set("reply_to", replyTo.id);
      const res = await onPost(fd);
      if (res.error) { setErr(res.error); return; }
      if (res.row) addMessages([res.row as unknown as ChatMessage]);
      setBody(""); setFile(null); setPreview(null); setReplyTo(null);
    });
  }

  return (
    <div className={`card p-5 flex flex-col relative ${dragging ? "ring-2 ring-purple" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); } }}
      onPaste={(e) => { const f = Array.from(e.clipboardData?.files ?? [])[0]; if (f) { e.preventDefault(); pick(f); } }}>
      {dragging && <div className="absolute inset-0 z-30 rounded-2xl bg-lavender/60 grid place-items-center text-purple font-semibold pointer-events-none">วางไฟล์ที่นี่เพื่อแนบ</div>}
      {title && <h2 className="font-display font-bold mb-3">{title}</h2>}
      <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight }}>
        {messages.map((m) => {
          const mine = m.author_id === meId;
          if (m.kind === "status") return <div key={m.id} className="text-center text-[11px] text-ink-soft"><span className="bg-cream px-2 py-0.5 rounded-full">{m.app_users?.display_name ?? ""} · {m.body} · {fmtDateTime(m.created_at)}</span></div>;
          return (
            <div key={m.id} id={"msg-" + m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bg-purple text-white rounded-br-sm" : "bg-cream rounded-bl-sm"}`}>
                {!mine && <div className="text-[11px] font-semibold opacity-70 mb-0.5">{m.app_users?.display_name ?? m.app_users?.email}</div>}
                {m.reply_to && (() => { const q = messages.find((x) => x.id === m.reply_to); return (
                  <button type="button" onClick={() => document.getElementById("msg-" + m.reply_to)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`block w-full text-left mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] ${mine ? "bg-white/15 border-white/70 text-white/90" : "bg-white/70 border-purple text-ink-soft"}`}>
                    <span className="font-semibold">{nameOf(q) || "ตอบกลับ"}</span><span className="block truncate">{snippet(q)}</span>
                  </button>); })()}
                {m.body && <div className="whitespace-pre-wrap break-words">{renderBody(m.body)}</div>}
                {m.image_url && <a href={m.image_url} target="_blank" rel="noopener" download>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.image_url} alt="" className="mt-1 rounded-xl max-h-72 object-cover" /></a>}
                {m.file_url && <a href={m.file_url} target="_blank" rel="noopener" download className={`mt-1 flex items-center gap-2 underline ${mine ? "text-white" : "text-purple"}`}><Download size={14} /> {m.file_name ?? "ไฟล์แนบ"}</a>}
                <div className={`text-[10px] mt-1 flex items-center gap-3 ${mine ? "text-white/70" : "text-ink-soft"}`}>
                  <span>{fmtDateTime(m.created_at)}</span>
                  <button type="button" onClick={() => { setReplyTo(m); taRef.current?.focus(); }} className="flex items-center gap-1 underline" title="ตอบกลับข้อความนี้"><Reply size={11} /> ตอบกลับ</button>
                  {m.task_id ? <a href={`/work/tasks/${m.task_id}`} className="underline">→ งาน</a> : makeTaskHref && (
                    (m.mentions?.length ? m.mentions : []).length > 0
                      ? m.mentions!.map((emp) => <a key={emp} href={makeTaskHref(m, emp)} className="flex items-center gap-1 underline font-semibold" title="สั่งงานให้คนนี้"><ListPlus size={11} /> สั่งงานให้ {labelOf(emp) || "คนที่ถูกเอ่ยถึง"}</a>)
                      : <a href={makeTaskHref(m)} className="flex items-center gap-1 underline" title="เปลี่ยนเป็นงาน"><ListPlus size={11} /> เป็นงาน</a>
                  )}
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
        {replyTo && <div className="flex items-start gap-2 rounded-lg bg-lavender/30 border-l-2 border-purple px-3 py-1.5 text-xs"><Reply size={12} className="mt-0.5 text-purple shrink-0" /><div className="min-w-0 flex-1"><div className="font-semibold text-purple">ตอบกลับ {nameOf(replyTo)}</div><div className="truncate text-ink-soft">{snippet(replyTo)}</div></div><button type="button" onClick={() => setReplyTo(null)} className="text-ink-soft hover:text-red"><X size={14} /></button></div>}
        {preview && <div className="relative inline-block">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="" className="h-24 rounded-xl object-cover" /><button onClick={() => { setFile(null); setPreview(null); }} className="absolute -top-2 -right-2 bg-red text-white rounded-full h-6 w-6 text-xs">✕</button></div>}
        {file && !preview && <div className="text-xs flex items-center gap-2"><Paperclip size={12} /> {file.name} <button onClick={() => setFile(null)} className="text-red">ลบ</button></div>}
        {err && <div className="text-xs text-red">{err}</div>}
        <div className="flex gap-2 items-end">
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => imgRef.current?.click()} className="btn-ghost px-2.5" title="แนบรูป (ไม่เกิน 5 MB)"><ImageIcon size={18} /></button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-2.5" title="แนบไฟล์ (ไม่เกิน 5 MB)"><Paperclip size={18} /></button>
          <div className="relative flex-1">
            {mentionQ !== null && mentionResults.length > 0 && (
              <div className="absolute bottom-full mb-1 left-0 w-64 card p-1 z-20">
                {mentionResults.map((m, i) => <button key={m.employee_id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m); }} className={`block w-full text-left px-3 py-1.5 text-sm rounded-lg ${i === mentionIdx ? "bg-lavender/40" : "hover:bg-cream"}`}>@{m.label} <span className="text-[11px] text-ink-soft">{m.first_name}</span></button>)}
              </div>
            )}
            <textarea ref={taRef} value={body} onChange={(e) => onBodyChange(e.target.value)} onKeyDown={(e) => {
              if (mentionQ !== null && mentionResults.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionResults.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionResults.length) % mentionResults.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionResults[mentionIdx]); return; }
                if (e.key === "Escape") { setMentionQ(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }} className="input resize-none w-full" rows={1} placeholder={placeholder ?? (members.length ? "พิมพ์ข้อความ… @ เอ่ยถึงคน · ลากไฟล์/วางรูปลงได้ (Enter ส่ง)" : "พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)")} />
          </div>
          <button type="button" onClick={send} disabled={pending || (!body.trim() && !file)} className="btn-primary px-3.5"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
