"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { ShareFileButton } from "@/components/ShareFileButton";

export interface LightboxItem { url: string; name?: string | null; caption?: string | null }
const isImg = (u: string) => /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(u.split("?")[0]);
const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)$/i.test(u.split("?")[0]);

/** ดูรูปเต็มจอ + ก่อนหน้า/ถัดไป (ปุ่ม · ลูกศรคีย์บอร์ด · ปัดซ้ายขวาบนมือถือ) */
export function Lightbox({ items, index, onIndex, onClose }: { items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const n = items.length;
  const cur = items[index];
  const go = (d: number) => onIndex((index + d + n) % n);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  });
  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-ink/90 flex flex-col" onClick={onClose}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50 && n > 1) go(dx < 0 ? 1 : -1); }}>
      <div className="flex items-center gap-2 p-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <span className="rounded-full bg-white/15 px-3 py-1">{index + 1} / {n}</span>
        <span className="flex-1 truncate opacity-80">{cur.caption ?? cur.name ?? ""}</span>
        <ShareFileButton url={cur.url} name={cur.name} className="rounded-lg bg-white/15 px-3 py-1.5" />
        <a href={cur.url} target="_blank" rel="noopener" download className="rounded-lg bg-white/15 p-1.5" title="เปิด/ดาวน์โหลด"><Download size={18} /></a>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/15 p-1.5" title="ปิด (Esc)"><X size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center relative px-2 sm:px-16" onClick={(e) => e.stopPropagation()}>
        {n > 1 && <button type="button" onClick={() => go(-1)} className="absolute left-2 sm:left-4 z-10 rounded-full bg-white/20 hover:bg-white/35 text-white p-2.5" title="ก่อนหน้า (←)"><ChevronLeft size={28} /></button>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {isImg(cur.url) ? <img key={cur.url} src={cur.url} alt="" className="max-h-full max-w-full object-contain rounded-lg select-none" draggable={false} />
          : isVideo(cur.url) ? <video key={cur.url} src={cur.url} controls className="max-h-full max-w-full rounded-lg" />
          : <a href={cur.url} target="_blank" rel="noopener" className="btn-primary">เปิดไฟล์ {cur.name ?? ""}</a>}
        {n > 1 && <button type="button" onClick={() => go(1)} className="absolute right-2 sm:right-4 z-10 rounded-full bg-white/20 hover:bg-white/35 text-white p-2.5" title="ถัดไป (→)"><ChevronRight size={28} /></button>}
      </div>
      {n > 1 && n <= 40 && (
        <div className="flex gap-1.5 overflow-x-auto p-3 justify-center" onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => (
            <button key={i} type="button" onClick={() => onIndex(i)} className={`h-12 w-12 shrink-0 rounded-md overflow-hidden ring-2 ${i === index ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {isImg(it.url) ? <img src={it.url} alt="" className="h-full w-full object-cover" /> : <span className="h-full w-full grid place-items-center bg-white/20 text-white text-[10px]">{i + 1}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
