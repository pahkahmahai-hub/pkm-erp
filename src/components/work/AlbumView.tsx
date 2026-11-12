"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, ChevronLeft, ChevronRight, X, Trash2, Star, Download, Pencil } from "lucide-react";
import type { Album, AlbumPhoto } from "@/lib/work/types";
import { uploadRoomFiles } from "@/lib/work/upload";
import { addAlbumPhotos, deleteAlbumPhoto, setAlbumCover, setPhotoCaption } from "@/app/(app)/work/actions";

export function AlbumView({ roomKey, roomId, album, photos, meId, canManage, deleteAlbumAction }: { roomKey: string; roomId: string; album: Album; photos: AlbumPhoto[]; meId: string; canManage: boolean; deleteAlbumAction: () => Promise<void> }) {
  const router = useRouter();
  const [idx, setIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) return;
    start(async () => {
      setErr(null);
      try {
        const up = await uploadRoomFiles(roomId, files, (d, t) => setProgress(`กำลังอัปโหลด ${d}/${t}`));
        const r = await addAlbumPhotos(roomKey, album.id, up.map((u) => ({ url: u.url, caption: null })));
        if (r.error) setErr(r.error);
        router.refresh();
      } catch (e) { setErr((e as Error).message); }
      setProgress(null);
    });
  };
  const cur = idx === null ? null : photos[idx];
  const move = useCallback((d: number) => setIdx((i) => (i === null ? null : (i + d + photos.length) % photos.length)), [photos.length]);
  useEffect(() => {
    if (idx === null) return;
    const h = (e: KeyboardEvent) => { if (e.key === "ArrowRight") move(1); else if (e.key === "ArrowLeft") move(-1); else if (e.key === "Escape") setIdx(null); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [idx, move]);
  const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);

  return (
    <div className={`space-y-4 relative rounded-2xl ${dragging ? "ring-2 ring-purple" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
      onPaste={(e) => upload(e.clipboardData?.files)}>
      {dragging && <div className="absolute inset-0 z-30 rounded-2xl bg-lavender/60 grid place-items-center text-purple font-semibold text-lg pointer-events-none">วางรูปเพื่อเพิ่มเข้าอัลบั้ม</div>}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary"><Upload size={16} /> {busy ? progress ?? "กำลังบันทึก…" : "เพิ่มรูป"}</button>
        <span className="text-xs text-ink-soft">{photos.length} รูป · เลือกได้หลายรูป หรือลากรูปมาวางในหน้านี้</span>
        {canManage && <span className="ml-auto flex gap-2">
          <Link href={`?edit=1`} className="btn-outline py-1.5"><Pencil size={14} /> แก้ชื่ออัลบั้ม</Link>
          <form action={deleteAlbumAction} onSubmit={(e) => { if (!confirm(`ลบอัลบั้ม "${album.title}" และรูปทั้งหมด?`)) e.preventDefault(); }}><button className="btn-outline py-1.5 !border-red !text-red"><Trash2 size={14} /> ลบอัลบั้ม</button></form>
        </span>}
      </div>
      {err && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-2">{err}</div>}

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setIdx(i)} className="relative aspect-square overflow-hidden rounded-xl bg-cream ring-1 ring-line group">
            {isVideo(p.url) ? <video src={p.url} className="w-full h-full object-cover" muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />}
            {album.cover_url === p.url && <span className="absolute left-1 top-1 rounded-full bg-yellow text-ink p-1"><Star size={10} /></span>}
            {p.caption && <span className="absolute inset-x-0 bottom-0 bg-ink/60 text-white text-[10px] px-1.5 py-0.5 truncate text-left">{p.caption}</span>}
          </button>
        ))}
      </div>
      {!photos.length && <button type="button" onClick={() => fileRef.current?.click()} className="w-full card p-12 text-center text-ink-soft border-2 border-dashed border-line">ยังไม่มีรูป — คลิกหรือลากรูปมาวางที่นี่</button>}

      {cur && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setIdx(null)}>
          <div className="flex items-center gap-2 p-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
            <span>{(idx ?? 0) + 1} / {photos.length}{cur.app_users?.display_name ? ` · ${cur.app_users.display_name}` : ""}</span>
            <span className="ml-auto flex items-center gap-2">
              <a href={cur.url} download target="_blank" rel="noopener" className="rounded-lg bg-white/15 px-3 py-1.5 flex items-center gap-1"><Download size={14} /> ดาวน์โหลด</a>
              <button type="button" onClick={() => start(async () => { const r = await setAlbumCover(roomKey, album.id, cur.url); if (r.error) setErr(r.error); router.refresh(); })} className="rounded-lg bg-white/15 px-3 py-1.5 flex items-center gap-1"><Star size={14} /> ตั้งเป็นปก</button>
              {(canManage || cur.created_by === meId) && <button type="button" onClick={() => { if (!confirm("ลบรูปนี้?")) return; const id = cur.id; start(async () => { const r = await deleteAlbumPhoto(roomKey, album.id, id); if (r.error) { setErr(r.error); return; } setIdx(null); router.refresh(); }); }} className="rounded-lg bg-red/80 px-3 py-1.5 flex items-center gap-1"><Trash2 size={14} /> ลบ</button>}
              <button type="button" onClick={() => setIdx(null)} className="rounded-lg bg-white/15 p-1.5"><X size={18} /></button>
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center relative min-h-0 px-12" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => move(-1)} className="absolute left-2 rounded-full bg-white/15 text-white p-2"><ChevronLeft size={24} /></button>
            {isVideo(cur.url) ? <video src={cur.url} controls className="max-h-full max-w-full rounded-lg" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={cur.url} alt="" className="max-h-full max-w-full object-contain rounded-lg" />}
            <button type="button" onClick={() => move(1)} className="absolute right-2 rounded-full bg-white/15 text-white p-2"><ChevronRight size={24} /></button>
          </div>
          <div className="p-3" onClick={(e) => e.stopPropagation()}>
            <input key={cur.id} defaultValue={cur.caption ?? ""} readOnly={!(canManage || cur.created_by === meId)} onBlur={(e) => { if (e.target.value !== (cur.caption ?? "")) { const v = e.target.value; start(async () => { await setPhotoCaption(roomKey, album.id, cur.id, v); router.refresh(); }); } }}
              className="w-full max-w-2xl mx-auto block rounded-lg bg-white/10 text-white placeholder:text-white/50 px-3 py-2 text-sm outline-none" placeholder="คำอธิบายรูป (พิมพ์แล้วคลิกที่อื่นเพื่อบันทึก)" />
          </div>
        </div>
      )}
    </div>
  );
}
