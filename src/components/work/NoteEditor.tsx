"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, Trash2, Paperclip, Image as ImageIcon, X, Check, Download } from "lucide-react";
import { NOTE_COLORS, type Note, type NoteFile } from "@/lib/work/types";
import { uploadRoomFiles } from "@/lib/work/upload";
import { saveNote, deleteNote } from "@/app/(app)/work/actions";

type Pending = { key: string; file: File; preview: string | null };

export function NoteEditor({ roomKey, roomId, note, canEdit }: { roomKey: string; roomId: string; note: Note | null; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [color, setColor] = useState(note?.color ?? NOTE_COLORS[0]);
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [files, setFiles] = useState<NoteFile[]>(((note?.work_note_files ?? []) as NoteFile[]).sort((a, b) => a.sort_order - b.sort_order));
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | File[] | null | undefined) => {
    if (!list || !canEdit) return;
    setPending((p) => [...p, ...Array.from(list).map((f) => ({ key: crypto.randomUUID(), file: f, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }))]);
  };
  const save = () => start(async () => {
    setErr(null);
    try {
      const up = pending.length ? await uploadRoomFiles(roomId, pending.map((p) => p.file), (d, t) => setProgress(`อัปโหลด ${d}/${t}`)) : [];
      setProgress(null);
      const r = await saveNote(roomKey, { id: note?.id ?? null, room_id: roomId, title, body, color, pinned, files: up, remove_file_ids: removed });
      if (r.error) { setErr(r.error); return; }
      setPending([]); setRemoved([]);
      if (!note) router.replace(`/work/rooms/${roomKey}/notes/${r.id}`);
      else router.refresh();
    } catch (e) { setProgress(null); setErr((e as Error).message); }
  });

  const shownFiles = files.filter((f) => !removed.includes(f.id));
  const imgs = shownFiles.filter((f) => f.is_image);
  const docs = shownFiles.filter((f) => !f.is_image);

  return (
    <div className={`rounded-2xl border p-5 space-y-4 shadow-sm relative ${dragging ? "ring-2 ring-purple" : "border-line"}`} style={{ background: color }}
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); } }}
      onPaste={(e) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) { e.preventDefault(); add(fs); } }}>
      {dragging && <div className="absolute inset-0 z-20 rounded-2xl bg-lavender/60 grid place-items-center text-purple font-semibold pointer-events-none">วางไฟล์เพื่อแนบในโน้ต</div>}
      {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-2">{err}</div>}
      <input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={!canEdit} className="w-full bg-transparent font-display text-xl font-bold outline-none placeholder:text-ink-soft/60" placeholder="หัวข้อโน้ต" autoFocus={!note} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} readOnly={!canEdit} rows={Math.max(6, body.split("\n").length + 1)} className="w-full bg-transparent outline-none resize-none text-[15px] leading-relaxed placeholder:text-ink-soft/60" placeholder="พิมพ์ข้อความ… (ลากรูป/ไฟล์มาวาง หรือ Ctrl+V วางรูปได้)" />

      {(imgs.length > 0 || pending.some((p) => p.preview)) && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {imgs.map((f) => (
            <div key={f.id} className="relative group">
              <button type="button" onClick={() => setBig(f.url)} className="block w-full aspect-square overflow-hidden rounded-lg ring-1 ring-line bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={f.url} alt="" className="w-full h-full object-cover" /></button>
              {canEdit && <button type="button" onClick={() => setRemoved((r) => [...r, f.id])} className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 rounded bg-white/90 text-red p-1 shadow"><Trash2 size={12} /></button>}
            </div>))}
          {pending.filter((p) => p.preview).map((p) => (
            <div key={p.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.preview!} alt="" className="w-full aspect-square object-cover rounded-lg ring-2 ring-purple/50 opacity-80" />
              <span className="absolute left-1 top-1 rounded bg-purple text-white text-[10px] px-1">ใหม่</span>
              <button type="button" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))} className="absolute right-1 top-1 rounded bg-white/90 text-red p-1 shadow"><X size={12} /></button>
            </div>))}
        </div>
      )}
      {(docs.length > 0 || pending.some((p) => !p.preview)) && (
        <div className="space-y-1 text-sm">
          {docs.map((f) => <div key={f.id} className="flex items-center gap-2"><a href={f.url} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-purple underline"><Download size={13} /> {f.name ?? "ไฟล์แนบ"}</a>{canEdit && <button type="button" onClick={() => setRemoved((r) => [...r, f.id])} className="text-ink-soft hover:text-red"><X size={13} /></button>}</div>)}
          {pending.filter((p) => !p.preview).map((p) => <div key={p.key} className="flex items-center gap-2 text-ink-soft"><Paperclip size={13} /> {p.file.name} <span className="text-[10px] text-purple">(ใหม่)</span><button type="button" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))} className="hover:text-red"><X size={13} /></button></div>)}
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-ink/10">
          <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => imgRef.current?.click()} className="btn-ghost px-2.5" title="แนบรูป"><ImageIcon size={18} /></button>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-2.5" title="แนบไฟล์"><Paperclip size={18} /></button>
          <div className="flex gap-1 ml-1">{NOTE_COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border ${color === c ? "ring-2 ring-ink" : "border-line"}`} style={{ background: c }} title="สีโน้ต" />)}</div>
          <button type="button" onClick={() => setPinned(!pinned)} className={`btn-ghost px-2.5 ${pinned ? "text-purple" : "text-ink-soft"}`} title="ปักหมุดไว้บนสุด"><Pin size={16} /> {pinned ? "ปักหมุดแล้ว" : "ปักหมุด"}</button>
          <span className="ml-auto flex items-center gap-2">
            {progress && <span className="text-xs text-ink-soft">{progress}</span>}
            {note && <form action={deleteNote.bind(null, roomKey, note.id)} onSubmit={(e) => { if (!confirm("ลบโน้ตนี้?")) e.preventDefault(); }}><button className="btn-outline !border-red !text-red"><Trash2 size={14} /> ลบ</button></form>}
            <button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary"><Check size={16} /> {busy ? "กำลังบันทึก…" : "บันทึก"}</button>
          </span>
        </div>
      ) : <p className="text-xs text-ink-soft pt-2 border-t border-ink/10">แก้ไขได้เฉพาะผู้เขียน หัวหน้าห้อง หรือผู้บริหาร</p>}

      {big && <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setBig(null)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={big} alt="" className="max-h-[92vh] max-w-full rounded-lg" /></div>}
    </div>
  );
}
