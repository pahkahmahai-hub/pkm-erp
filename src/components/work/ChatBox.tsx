"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Paperclip, Send, Download, Trash2, ListPlus, Reply, X, Eye, Camera, MoreHorizontal, Copy, Pencil, Pin, PinOff, Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadChatFile, CHAT_MAX_BYTES } from "@/lib/work/upload";
import { fmtDateTime } from "@/lib/format";
import { fetchNewer } from "@/app/(app)/work/actions";
import { ShareFileButton } from "@/components/ShareFileButton";
import { messageAcks, toggleReaction, editMessage, pinMessage, pinnedMessages, searchMessages, messagesAround, messageById } from "@/app/(app)/work/actions";
import { Lightbox } from "@/components/Lightbox";
import { linkify, youtubeId } from "@/components/Linkify";
import { Play } from "lucide-react";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "✅", "🔥"];

export interface ChatMember { employee_id: string; label: string; first_name: string; isUser?: boolean }   // isUser = id เป็น app_user (ผู้บริหารที่ไม่มีประวัติพนักงาน)
export interface Reader { user_id: string; name: string; last_read_at: string }
export interface ChatMessage {
  id: string; author_id: string | null; body: string | null; image_url: string | null; file_url: string | null; file_name: string | null;
  kind?: string; task_id?: string | null; mentions?: string[] | null; reply_to?: string | null; created_at: string;
  edited_at?: string | null; pinned_at?: string | null;
  app_users?: { display_name: string | null; email: string } | null;
}

export function ChatBox({
  table, filterColumn, filterValue, initial, meId, onPost, onDelete, title, placeholder, makeTaskHref, maxHeight = "480px", members = [], markRead, loadReads, names = {}, canPinAll = false,
}: {
  table: "work_comments" | "work_room_messages"; filterColumn: "task_id" | "room_id"; filterValue: string; initial: ChatMessage[]; meId: string;
  onPost: (fd: FormData) => Promise<{ error?: string; row?: Record<string, unknown> }>;
  onDelete: (id: string) => Promise<void>;
  title?: string; placeholder?: string;
  makeTaskHref?: (m: ChatMessage, assignee?: string) => string;   // "เปลี่ยนเป็นงาน" (assignee = employee id ที่ถูก @)
  maxHeight?: string;
  members?: ChatMember[];                          // สำหรับ @mention
  markRead?: () => Promise<void>;                   // บันทึกว่าอ่านแล้ว (แชทห้อง)
  loadReads?: () => Promise<Reader[]>;              // ใครอ่านถึงไหน (แชทห้อง)
  names?: Record<string, string>;                   // user id → ชื่อ (0056) เพราะพนักงานอ่าน app_users คนอื่นไม่ได้
  canPinAll?: boolean;                              // หัวหน้าห้อง/ผู้บริหาร ปักหมุดข้อความของใครก็ได้
}) {
  const [readers, setReaders] = useState<Reader[]>([]);
  const [seenOpen, setSeenOpen] = useState<string | null>(null);
  const [mentionQ, setMentionQ] = useState<string | null>(null);   // text after the "@" being typed
  const [mentionIdx, setMentionIdx] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // @ทุกคน (หรือ @all) = เอ่ยถึงสมาชิกทุกคนในห้อง
  const ALL: ChatMember = { employee_id: "__all__", label: "ทุกคน", first_name: `แจ้งเตือนสมาชิกทั้งห้อง (${members.length} คน)` } as ChatMember;
  const q = (mentionQ ?? "").toLowerCase();
  const mentionResults = mentionQ === null ? [] : [
    ...(members.length > 1 && ("ทุกคน".includes(q) || "all".includes(q) || "everyone".includes(q)) ? [ALL] : []),
    ...members.filter((m) => m.label.toLowerCase().includes(q) || m.first_name.toLowerCase().includes(q)),
  ].slice(0, 7);
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
  const isAll = (text: string) => /@(ทุกคน|all|everyone)(?![\p{L}\p{M}\w])/iu.test(text);
  const mentionedIds = (text: string) => members.filter((m) => isAll(text) || text.includes(`@${m.label}`)).map((m) => m.employee_id);
  const labelOf = (empId: string) => members.find((m) => m.employee_id === empId)?.label ?? "";
  const renderBody = (text: string) => {
    const labels = [...members.map((m) => m.label), "ทุกคน", "all", "everyone"].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!labels.length) return linkify(text);
    const re = new RegExp(`(@(?:${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
    return text.split(re).map((part, i) => (part.startsWith("@") && labels.includes(part.slice(1)) ? <mark key={i} className="bg-yellow/40 text-inherit rounded px-0.5 font-semibold">{part}</mark> : linkify(part, `p${i}-`)));
  };
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [body, setBody] = useState("");
  // แนบได้หลายไฟล์ (สูงสุด 10) — ส่งเป็นข้อความละ 1 ไฟล์ ข้อความพิมพ์ติดไปกับไฟล์แรก
  const [files, setFiles] = useState<{ f: File; url: string | null }[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [dragging, setDragging] = useState(false);
  const authorName = (m: ChatMessage) => (m.author_id && names[m.author_id]) || m.app_users?.display_name || m.app_users?.email || "";
  const nameOf = (m: ChatMessage | undefined) => (m ? (m.author_id === meId ? "คุณ" : authorName(m)) : "");
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

  const skipBottom = useRef(false);
  useEffect(() => { if (skipBottom.current) { skipBottom.current = false; return; } bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  // อ่านแล้ว: มีข้อความใหม่ขณะเปิดหน้าอยู่ → บันทึกว่าอ่าน · ดึงสถานะคนอ่านทุก 10 วิ
  const readsRef = useRef({ markRead, loadReads }); readsRef.current = { markRead, loadReads };
  useEffect(() => {
    if (!readsRef.current.markRead || document.visibilityState !== "visible") return;
    const t = setTimeout(() => { readsRef.current.markRead?.().then(() => readsRef.current.loadReads?.().then(setReaders)).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [messages.length]);
  useEffect(() => {
    if (!readsRef.current.loadReads) return;
    let alive = true;
    const tick = () => { readsRef.current.loadReads?.().then((r) => { if (alive) setReaders(r); }).catch(() => {}); };
    tick(); const t = setInterval(tick, 10000);
    const onVis = () => { if (document.visibilityState === "visible") { readsRef.current.markRead?.().then(tick).catch(() => {}); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  // ดูรูปในแชทแบบเลื่อนก่อนหน้า/ถัดไป
  const [lb, setLb] = useState<number | null>(null);
  const chatImgMsgs = messages.filter((m) => m.image_url);
  const chatImgs = chatImgMsgs.map((m) => ({ url: m.image_url!, caption: m.body }));
  // วาด/แก้ไขรูปแล้วส่งกลับเข้าแชทนี้ (ตอบกลับข้อความรูปเดิม)
  async function sendEdited(file: File, note: string, i: number): Promise<string | void> {
    const up = await uploadChatFile(`chat/${filterValue}`, file);
    const fd = new FormData();
    fd.set("body", note ? `✏️ ${note}` : "✏️ แก้ไขรูป");
    fd.set("mentions", JSON.stringify(mentionedIds(note)));
    fd.set("uploaded_url", up.url); fd.set("uploaded_name", up.name); fd.set("uploaded_is_image", "1");
    const orig = chatImgMsgs[i]; if (orig) fd.set("reply_to", orig.id);
    const res = await onPost(fd);
    if (res.error) return res.error;
    if (res.row) addMessages([res.row as unknown as ChatMessage]);
  }
  // อีโมจิ / ปุ่มรับทราบ (0065, 0069) — 👍 = รับทราบ
  const ackKind: "room" | "comment" | null = table === "work_room_messages" ? "room" : table === "work_comments" ? "comment" : null;
  type Re = { user_id: string; name: string; emoji: string };
  const [acks, setAcks] = useState<Record<string, Re[]>>({});
  const [ackOpen, setAckOpen] = useState<string | null>(null);
  const idsKey = messages.filter((m) => (m as { kind?: string }).kind !== "status").map((m) => m.id).slice(-150).join(",");
  useEffect(() => {
    if (!ackKind || !idsKey) return;
    let alive = true;
    const load = () => messageAcks(ackKind, idsKey.split(",")).then((rows) => {
      if (!alive) return;
      const g: Record<string, Re[]> = {};
      for (const x of rows) (g[x.message_id] = g[x.message_id] ?? []).push({ user_id: x.user_id, name: x.name, emoji: x.emoji || "👍" });
      setAcks(g);
    }).catch(() => {});
    load(); const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [ackKind, idsKey]);
  function react(m: ChatMessage, emoji = "👍") {
    if (!ackKind) return;
    const had = (acks[m.id] ?? []).some((x) => x.user_id === meId && x.emoji === emoji);
    setAcks((c) => ({ ...c, [m.id]: had ? (c[m.id] ?? []).filter((x) => !(x.user_id === meId && x.emoji === emoji)) : [...(c[m.id] ?? []), { user_id: meId, name: "คุณ", emoji }] }));
    toggleReaction(ackKind, m.id, emoji).then((r) => { if ("error" in r && r.error) setErr(r.error); }).catch(() => {});
  }
  const ack = (m: ChatMessage) => react(m, "👍");
  const groupRe = (id: string) => { const g = new Map<string, Re[]>(); for (const x of acks[id] ?? []) g.set(x.emoji, [...(g.get(x.emoji) ?? []), x]); return [...g.entries()]; };

  // ⋯ เมนูข้อความ · แก้ไข · ปักหมุด · ค้นหา · กระโดดไปที่ข้อความ (0069)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 1800); };
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPress = (id: string) => ({
    onContextMenu: (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest("a,button,textarea")) return; e.preventDefault(); setMenuFor(id); },
    onTouchStart: (e: React.TouchEvent) => { if ((e.target as HTMLElement).closest("a,button,textarea")) return; press.current = setTimeout(() => { setMenuFor(id); navigator.vibrate?.(15); }, 550); },
    onTouchEnd: () => { if (press.current) clearTimeout(press.current); },
    onTouchMove: () => { if (press.current) clearTimeout(press.current); },
  });
  async function copyText(m: ChatMessage) {
    try { await navigator.clipboard.writeText(m.body ?? m.file_url ?? m.image_url ?? ""); flash("คัดลอกแล้ว"); } catch { setErr("คัดลอกไม่ได้ในเบราว์เซอร์นี้"); }
    setMenuFor(null);
  }
  function saveEdit() {
    if (!editing || !ackKind) return;
    const e = editing; setEditing(null);
    setMessages((c) => c.map((x) => (x.id === e.id ? { ...x, body: e.text.trim() || null, edited_at: new Date().toISOString() } : x)));
    editMessage(ackKind, e.id, e.text).then((r) => { if (r.error) setErr(r.error); });
  }
  function unsend(m: ChatMessage) {
    setMenuFor(null);
    if (!confirm("ยกเลิกส่งข้อความนี้? ทุกคนจะไม่เห็นข้อความนี้อีก")) return;
    setMessages((c) => c.filter((x) => x.id !== m.id));
    start(() => onDelete(m.id));
  }
  const isRoom = table === "work_room_messages";
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const loadPinned = () => { if (isRoom) pinnedMessages(filterValue).then((r) => setPinned(r as unknown as ChatMessage[])).catch(() => {}); };
  useEffect(loadPinned, [isRoom, filterValue]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pinKey = messages.filter((m) => m.pinned_at).map((m) => m.id + m.pinned_at).join();
  useEffect(() => { if (pinKey) loadPinned(); }, [pinKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  function pin(m: ChatMessage, on: boolean) {
    setMenuFor(null);
    setMessages((c) => c.map((x) => (x.id === m.id ? { ...x, pinned_at: on ? new Date().toISOString() : null } : x)));
    setPinned((c) => (on ? [{ ...m, pinned_at: new Date().toISOString() }, ...c.filter((x) => x.id !== m.id)] : c.filter((x) => x.id !== m.id)));
    pinMessage(m.id, on).then((r) => { if (r.error) { setErr(r.error); loadPinned(); } else flash(on ? "ปักหมุดแล้ว" : "เลิกปักหมุดแล้ว"); });
  }
  const [pinOpen, setPinOpen] = useState(false);
  // ปักหมุดที่แสดง = จากเซิร์ฟเวอร์ (รวมข้อความเก่าที่ยังไม่โหลด) + ที่อยู่ในแชทตอนนี้
  const pinList = [...pinned, ...messages.filter((m) => m.pinned_at && !pinned.some((p) => p.id === m.id))].filter((m) => messages.find((x) => x.id === m.id)?.pinned_at !== null);

  /** เลื่อนไปที่ข้อความ + ไฮไลต์ (ถ้ายังไม่ได้โหลด ดึงข้อความช่วงนั้นมาก่อน) */
  const msgsRef = useRef(messages); msgsRef.current = messages;
  async function jumpTo(id: string) {
    let el = document.getElementById("msg-" + id);
    if (!el && !msgsRef.current.some((x) => x.id === id)) {
      const m = await messageById(table, id).catch(() => null);
      if (!m) { setErr("ไม่พบข้อความนี้ (อาจถูกยกเลิกส่งแล้ว)"); return; }
      skipBottom.current = true;
      addMessages((await messagesAround(table, filterColumn, filterValue, m.created_at)) as unknown as ChatMessage[]);
      await new Promise((r) => setTimeout(r, 80));
      el = document.getElementById("msg-" + id);
    }
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHl(id); setTimeout(() => setHl((h) => (h === id ? null : h)), 3000);
  }
  useEffect(() => {
    const go = () => { const h = decodeURIComponent(location.hash); if (h.startsWith("#msg-")) setTimeout(() => jumpTo(h.slice(5)), 300); };
    go(); window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const [searchOpen, setSearchOpen] = useState(false);
  const [sq, setSq] = useState("");
  const [sres, setSres] = useState<ChatMessage[] | null>(null);
  const [sbusy, setSbusy] = useState(false);
  useEffect(() => {
    if (!searchOpen || sq.trim().length < 2) { setSres(null); return; }
    setSbusy(true);
    const t = setTimeout(() => searchMessages(table, filterColumn, filterValue, sq).then((r) => setSres(r as unknown as ChatMessage[])).catch(() => setSres([])).finally(() => setSbusy(false)), 350);
    return () => clearTimeout(t);
  }, [sq, searchOpen, table, filterColumn, filterValue]);
  const hi = (text: string) => { const q2 = sq.trim(); if (!q2) return text; const i = text.toLowerCase().indexOf(q2.toLowerCase()); if (i < 0) return text.slice(0, 120); const a = Math.max(0, i - 40); return <>{a > 0 && "…"}{text.slice(a, i)}<mark className="bg-yellow/60">{text.slice(i, i + q2.length)}</mark>{text.slice(i + q2.length, i + q2.length + 80)}</>; };

  const seenBy = (m: ChatMessage) => readers.filter((x) => x.user_id !== m.author_id && new Date(x.last_read_at).getTime() >= new Date(m.created_at).getTime());

  function pick(list: FileList | File[] | null | undefined) {
    const arr = Array.from(list ?? []);
    if (!arr.length) return;
    // รูปจะถูกย่อก่อนส่ง จึงตรวจขนาดตอนส่ง · ไฟล์อื่นตรวจทันที
    const big = arr.find((f) => !f.type.startsWith("image/") && f.size > CHAT_MAX_BYTES);
    if (big) { setErr(`ไฟล์ "${big.name}" ใหญ่ ${(big.size / 1024 / 1024).toFixed(1)} MB — ส่งได้ไม่เกิน 5 MB ต่อไฟล์`); return; }
    setErr(null);
    setFiles((cur) => [...cur, ...arr.map((f) => ({ f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }))].slice(0, 10));
  }
  // กันกดส่งรัวๆ: ล็อกทันทีที่กด (ไม่รอ state) + ล้างช่องพิมพ์ทันที ถ้าส่งไม่สำเร็จค่อยคืนข้อความ
  const sendingRef = useRef(false);
  function send() {
    if (sendingRef.current) return;
    if (!body.trim() && !files.length) return;
    sendingRef.current = true;
    setErr(null);
    const snap = { body, files, replyTo };
    setBody(""); if (taRef.current) taRef.current.style.height = ""; setFiles([]); setReplyTo(null);
    const restore = (msg: string, left: typeof files, keepText: boolean) => { setErr(msg); if (keepText) { setBody(snap.body); setReplyTo(snap.replyTo); } setFiles(left); };
    start(async () => {
      try {
        // ข้อความละ 1 ไฟล์ (ไม่มีไฟล์ = ส่งข้อความเดียว) · ข้อความพิมพ์/ตอบกลับ/@ ติดไปกับอันแรก
        const jobs = snap.files.length ? snap.files : [null];
        for (let i = 0; i < jobs.length; i++) {
          const it = jobs[i];
          const fd = new FormData();
          fd.set("body", i === 0 ? snap.body : "");
          fd.set("mentions", JSON.stringify(i === 0 ? mentionedIds(snap.body) : []));
          if (it) {
            // อัปโหลดจากเบราว์เซอร์ตรงไป storage (ไม่ผ่าน server action ซึ่งรับได้ ~1 MB) แล้วส่งแค่ลิงก์
            try {
              const up = await uploadChatFile(`chat/${filterValue}`, it.f);
              fd.set("uploaded_url", up.url); fd.set("uploaded_name", up.name); fd.set("uploaded_is_image", up.is_image ? "1" : "0");
            } catch (e) { restore((e as Error).message, snap.files.slice(i) as typeof files, i === 0); return; }
          }
          if (i === 0 && snap.replyTo) fd.set("reply_to", snap.replyTo.id);
          const res = await onPost(fd);
          if (res.error) { restore(res.error, snap.files.slice(i) as typeof files, i === 0); return; }
          if (res.row) addMessages([res.row as unknown as ChatMessage]);
        }
      } catch (e) {
        setErr((e as Error).message || "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
      } finally {
        sendingRef.current = false;
      }
    });
  }

  return (
    <div className={`card p-5 flex flex-col relative ${dragging ? "ring-2 ring-purple" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); } }}
      onPaste={(e) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) { e.preventDefault(); pick(fs); } }}>
      {dragging && <div className="absolute inset-0 z-30 rounded-2xl bg-lavender/60 grid place-items-center text-purple font-semibold pointer-events-none">วางไฟล์ที่นี่เพื่อแนบ</div>}
      <div className="flex items-center gap-2 mb-3">
        {title && <h2 className="font-display font-bold">{title}</h2>}
        <button type="button" onClick={() => { setSearchOpen((v) => !v); setSq(""); }} className={`ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs ${searchOpen ? "bg-purple text-white" : "text-ink-soft hover:text-purple border border-line"}`} title="ค้นข้อความย้อนหลัง"><Search size={13} /> ค้นข้อความ</button>
      </div>
      {searchOpen && (
        <div className="mb-3 rounded-xl border border-line bg-white p-2 space-y-2">
          <div className="flex items-center gap-2">
            <input autoFocus value={sq} onChange={(e) => setSq(e.target.value)} placeholder="พิมพ์คำที่จะค้น เช่น ใบแจ้งหนี้ / ชื่อไฟล์" className="input py-1.5 flex-1" />
            {sbusy && <Loader2 size={16} className="animate-spin text-ink-soft" />}
            <button type="button" onClick={() => setSearchOpen(false)} className="text-ink-soft"><X size={16} /></button>
          </div>
          {sres && <div className="max-h-60 overflow-y-auto divide-y divide-line text-sm">
            {sres.map((r) => (
              <button key={r.id} type="button" onClick={() => jumpTo(r.id)} className="block w-full text-left px-2 py-1.5 hover:bg-cream">
                <div className="text-[11px] text-ink-soft">{authorName(r) || "—"} · {fmtDateTime(r.created_at)}</div>
                <div className="truncate">{r.body ? hi(r.body) : r.file_name ? <>📎 {hi(r.file_name)}</> : "📷 รูปภาพ"}</div>
              </button>
            ))}
            {!sres.length && <div className="px-2 py-3 text-ink-soft text-center">ไม่พบข้อความที่มีคำนี้</div>}
          </div>}
        </div>
      )}
      {isRoom && pinList.length > 0 && (
        <div className="mb-3 rounded-xl bg-lavender/30 border-l-4 border-purple text-sm">
          {(pinOpen ? pinList : pinList.slice(0, 1)).map((m) => (
            <button key={m.id} type="button" onClick={() => jumpTo(m.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-lavender/40">
              <Pin size={13} className="text-purple shrink-0" />
              <span className="font-semibold text-purple shrink-0">{authorName(m)}</span>
              <span className="truncate">{snippet(m)}</span>
            </button>
          ))}
          {pinList.length > 1 && <button type="button" onClick={() => setPinOpen((v) => !v)} className="px-3 pb-1 text-[11px] text-purple underline">{pinOpen ? "ย่อ" : `ปักหมุดอีก ${pinList.length - 1} ข้อความ`}</button>}
        </div>
      )}
      {toast && <div className="absolute left-1/2 top-3 -translate-x-1/2 z-40 rounded-full bg-ink text-white text-xs px-3 py-1.5 shadow">{toast}</div>}
      <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight }}>
        {messages.map((m) => {
          const mine = m.author_id === meId;
          if (m.kind === "status") return <div key={m.id} className="text-center text-[13px] text-ink-soft"><span className="bg-cream px-2 py-0.5 rounded-full">{authorName(m)} · {m.body} · {fmtDateTime(m.created_at)}</span></div>;
          return (
            <div key={m.id} id={"msg-" + m.id} className={`flex ${mine ? "justify-end" : "justify-start"} scroll-mt-24`}>
              <div {...longPress(m.id)} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[17px] leading-relaxed transition-shadow ${mine ? "bg-purple text-white rounded-br-sm" : "bg-cream rounded-bl-sm"} ${hl === m.id ? "ring-4 ring-yellow shadow-lg" : ""}`}>
                {(!mine || m.pinned_at) && <div className="text-[13px] font-semibold opacity-70 mb-0.5 flex items-center gap-1">{!mine && authorName(m)}{m.pinned_at && <span className="flex items-center gap-0.5 font-normal"><Pin size={11} /> ปักหมุด</span>}</div>}
                {m.reply_to && (() => { const q = messages.find((x) => x.id === m.reply_to); return (
                  <button type="button" onClick={() => document.getElementById("msg-" + m.reply_to)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`block w-full text-left mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] ${mine ? "bg-white/15 border-white/70 text-white/90" : "bg-white/70 border-purple text-ink-soft"}`}>
                    <span className="font-semibold">{nameOf(q) || "ตอบกลับ"}</span>
                    {q?.image_url && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={q.image_url} alt="" className="mt-1 mb-0.5 rounded-lg max-h-36 max-w-[60%] object-cover" /></>}
                    {(q?.body || !q?.image_url) && <span className="block truncate">{snippet(q)}</span>}
                  </button>); })()}
                {editing?.id === m.id ? (
                  <div className="space-y-1.5">
                    <textarea autoFocus value={editing.text} onChange={(e) => setEditing({ id: m.id, text: e.target.value })} rows={3} className="input !text-[16px] w-full text-ink" />
                    <div className="flex gap-2 text-sm"><button type="button" onClick={saveEdit} className="rounded-lg bg-white text-purple font-semibold px-3 py-1">บันทึก</button><button type="button" onClick={() => setEditing(null)} className="underline opacity-80">ยกเลิก</button></div>
                  </div>
                ) : m.body && <div className="whitespace-pre-wrap break-words">{renderBody(m.body)}{m.edited_at && <span className="text-[11px] opacity-60"> (แก้ไขแล้ว)</span>}</div>}
                {m.body && youtubeId(m.body) && (
                  <a href={`https://www.youtube.com/watch?v=${youtubeId(m.body)}`} target="_blank" rel="noopener noreferrer" className="mt-1 block relative w-64 max-w-full rounded-xl overflow-hidden ring-1 ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${youtubeId(m.body)}/hqdefault.jpg`} alt="YouTube" className="w-full aspect-video object-cover" />
                    <span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-red text-white p-3 shadow-lg"><Play size={20} fill="currentColor" /></span></span>
                  </a>
                )}
                {m.image_url && <a href={m.image_url} target="_blank" rel="noopener" download onClick={(e) => { e.preventDefault(); setLb(chatImgs.findIndex((x) => x.url === m.image_url)); }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.image_url} alt="" className="mt-1 rounded-xl max-h-72 object-cover" /></a>}
                {m.file_url && <a href={m.file_url} target="_blank" rel="noopener" download className={`mt-1 flex items-center gap-2 underline ${mine ? "text-white" : "text-purple"}`}><Download size={14} /> {m.file_name ?? "ไฟล์แนบ"}</a>}
                <div className={`text-[12px] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${mine ? "text-white/70" : "text-ink-soft"}`}>
                  <span>{fmtDateTime(m.created_at)}</span>
                  <button type="button" onClick={() => { setReplyTo(m); taRef.current?.focus(); }} className="flex items-center gap-1 underline" title="ตอบกลับข้อความนี้"><Reply size={11} /> ตอบกลับ</button>
                  {ackKind && !mine && (() => { const on = (acks[m.id] ?? []).some((x) => x.user_id === meId && x.emoji === "👍"); return (
                    <button type="button" onClick={() => ack(m)} className={`rounded-full px-2 py-0.5 border font-semibold ${on ? "bg-green/15 border-green/40 text-green" : "border-purple/40 text-purple hover:bg-purple hover:text-white"}`} title={on ? "กดอีกครั้งเพื่อยกเลิก" : "กดรับทราบ ไม่ต้องพิมพ์"}>{on ? "✓ รับทราบแล้ว" : "👍 รับทราบ"}</button>); })()}
                  {m.task_id ? <a href={`/work/tasks/${m.task_id}`} className="underline">→ งาน</a> : makeTaskHref && (
                    table === "work_room_messages" && (m.mentions?.length ? m.mentions : []).length > 0 && !(m.mentions!.length > 2 && isAll(m.body ?? ""))
                      ? m.mentions!.filter((emp) => !members.find((x) => x.employee_id === emp)?.isUser).map((emp) => <a key={emp} href={makeTaskHref(m, emp)} className="flex items-center gap-1 underline font-semibold" title="สั่งงานให้คนนี้"><ListPlus size={11} /> สั่งงานให้ {labelOf(emp) || "คนที่ถูกเอ่ยถึง"}</a>)
                      : <a href={makeTaskHref(m)} className="flex items-center gap-1 underline" title="เปลี่ยนเป็นงาน"><ListPlus size={11} /> เป็นงาน</a>
                  )}
                  {loadReads && (() => { const sb = seenBy(m); return <button type="button" onClick={() => setSeenOpen(seenOpen === m.id ? null : m.id)} className="flex items-center gap-1 underline" title="ใครอ่านแล้วบ้าง"><Eye size={11} /> {sb.length ? `อ่านแล้ว ${sb.length}` : "ยังไม่มีคนอ่าน"}</button>; })()}
                  <button type="button" onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} className="rounded-full px-1.5 hover:bg-black/10" title="เพิ่มเติม: อีโมจิ · คัดลอก · แก้ไข · ปักหมุด · ยกเลิกส่ง (กดค้างที่ข้อความก็ได้)"><MoreHorizontal size={14} /></button>
                </div>
                {ackKind && groupRe(m.id).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {groupRe(m.id).map(([e, list]) => { const on = list.some((x) => x.user_id === meId); return (
                      <button key={e} type="button" onClick={() => react(m, e)} onDoubleClick={() => setAckOpen(ackOpen === m.id ? null : m.id)} title={list.map((x) => x.name).join(", ")}
                        className={`rounded-full px-2 py-0.5 text-[13px] border ${on ? (mine ? "bg-white text-purple border-white" : "bg-purple/10 border-purple text-purple") : (mine ? "border-white/40 text-white" : "border-line bg-white text-ink")}`}>{e} {list.length}</button>); })}
                    <button type="button" onClick={() => setAckOpen(ackOpen === m.id ? null : m.id)} className={`text-[11px] underline ${mine ? "text-white/70" : "text-ink-soft"}`}>ใครบ้าง</button>
                  </div>
                )}
                {menuFor === m.id && (
                  <div className={`mt-2 rounded-xl p-2 space-y-1.5 text-[14px] ${mine ? "bg-white/15" : "bg-white border border-line"}`}>
                    {ackKind && <div className="flex flex-wrap gap-1">{EMOJIS.map((e) => <button key={e} type="button" onClick={() => { react(m, e); setMenuFor(null); }} className="h-9 w-9 rounded-full text-xl hover:bg-black/10">{e}</button>)}</div>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {(m.body || m.file_url || m.image_url) && <button type="button" onClick={() => copyText(m)} className="flex items-center gap-1 underline"><Copy size={13} /> {m.body ? "คัดลอกข้อความ" : "คัดลอกลิงก์"}</button>}
                      {mine && ackKind && <button type="button" onClick={() => { setEditing({ id: m.id, text: m.body ?? "" }); setMenuFor(null); }} className="flex items-center gap-1 underline"><Pencil size={13} /> แก้ไข</button>}
                      {isRoom && (mine || canPinAll) && <button type="button" onClick={() => pin(m, !m.pinned_at)} className="flex items-center gap-1 underline">{m.pinned_at ? <><PinOff size={13} /> เลิกปักหมุด</> : <><Pin size={13} /> ปักหมุด</>}</button>}
                      {(m.image_url || m.file_url) && <ShareFileButton url={(m.image_url || m.file_url)!} name={m.file_name} />}
                      {mine && <button type="button" onClick={() => unsend(m)} className={`flex items-center gap-1 underline ${mine ? "text-[#ffc9c9]" : "text-red"}`}><Trash2 size={13} /> ยกเลิกส่ง</button>}
                      <button type="button" onClick={() => setMenuFor(null)} className="ml-auto opacity-70"><X size={14} /></button>
                    </div>
                  </div>
                )}
                {ackOpen === m.id && (acks[m.id]?.length ?? 0) > 0 && <div className={`mt-1.5 rounded-lg px-2 py-1.5 text-[13px] space-y-0.5 ${mine ? "bg-white/15 text-white" : "bg-white text-ink"}`}>{groupRe(m.id).map(([e, list]) => <div key={e}>{e} {e === "👍" ? "รับทราบ: " : ""}{list.map((x) => x.name).join(", ")}</div>)}</div>}
                {seenOpen === m.id && <div className={`mt-1.5 rounded-lg px-2 py-1.5 text-[13px] ${mine ? "bg-white/15 text-white" : "bg-cream text-ink"}`}>
                  {seenBy(m).length ? seenBy(m).map((x) => <div key={x.user_id} className="flex justify-between gap-3"><span>✓ {x.name}</span><span className="opacity-70">{fmtDateTime(x.last_read_at)}</span></div>) : <div className="opacity-80">ยังไม่มีใครเปิดอ่าน</div>}
                </div>}
              </div>
            </div>
          );
        })}
        {!messages.length && <div className="text-center text-ink-soft text-sm py-6">ยังไม่มีข้อความ</div>}
        <div ref={bottom} />
      </div>

      <div className="mt-4 border-t border-line pt-3 space-y-2">
        {replyTo && <div className="flex items-start gap-2 rounded-lg bg-lavender/30 border-l-2 border-purple px-3 py-1.5 text-xs"><Reply size={12} className="mt-0.5 text-purple shrink-0" />{replyTo.image_url && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={replyTo.image_url} alt="" className="h-12 w-12 rounded-md object-cover shrink-0" /></>}<div className="min-w-0 flex-1"><div className="font-semibold text-purple">ตอบกลับ {nameOf(replyTo)}</div><div className="truncate text-ink-soft">{snippet(replyTo)}</div></div><button type="button" onClick={() => setReplyTo(null)} className="text-ink-soft hover:text-red"><X size={14} /></button></div>}
        {files.length > 0 && <div className="flex flex-wrap gap-2 items-end">
          {files.map((x, i) => x.url
            ? <div key={i} className="relative">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={x.url} alt="" className="h-20 w-20 rounded-xl object-cover" /><button type="button" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 bg-red text-white rounded-full h-6 w-6 text-xs">✕</button></div>
            : <div key={i} className="text-xs flex items-center gap-2 rounded-lg border border-line px-2 py-1"><Paperclip size={12} /> <span className="max-w-[160px] truncate">{x.f.name}</span> <button type="button" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} className="text-red">ลบ</button></div>)}
          {files.length > 1 && <span className="text-[11px] text-ink-soft">{files.length} ไฟล์ · ส่งทีละรายการ</span>}
        </div>}
        {err && <div className="text-xs text-red">{err}</div>}
        <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
          <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => camRef.current?.click()} className="btn-ghost px-2.5" title="ถ่ายรูปด้วยกล้อง"><Camera size={18} /></button>
          <button type="button" onClick={() => imgRef.current?.click()} className="btn-ghost px-2.5" title="แนบรูป (เลือกได้หลายรูป)"><ImageIcon size={18} /></button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-2.5" title="แนบไฟล์ (ไม่เกิน 5 MB)"><Paperclip size={18} /></button>
          <div className="relative basis-full sm:basis-auto sm:flex-1 order-first sm:order-none">
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
              // มือถือ: Enter = ขึ้นบรรทัดใหม่ (กดปุ่มส่ง) · คอม: Enter = ส่ง, Shift+Enter = ขึ้นบรรทัด
              const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }} onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 240)}px`; }}
              className="input !text-[17px] resize-none w-full min-h-[96px] sm:min-h-[56px] leading-relaxed" rows={3} placeholder={placeholder ?? (members.length ? "พิมพ์ข้อความ… @ เอ่ยถึงคน · ลากไฟล์/วางรูปลงได้" : "พิมพ์ข้อความ…")} />
            <div className="hidden sm:block text-[10px] text-ink-soft mt-0.5">Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่</div>
          </div>
          <button type="button" onClick={send} disabled={pending || (!body.trim() && !files.length)} className="btn-primary px-3.5 ml-auto sm:ml-0 sm:mb-4"><Send size={16} /><span className="sm:hidden ml-1">ส่ง</span></button>
        </div>
      </div>
      {lb !== null && lb >= 0 && <Lightbox items={chatImgs} index={lb} onIndex={setLb} onClose={() => setLb(null)} onSendEdited={sendEdited} />}
    </div>
  );
}
