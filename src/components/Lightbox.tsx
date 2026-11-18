"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Download, ZoomIn, ZoomOut, Pencil } from "lucide-react";
import { ShareFileButton } from "@/components/ShareFileButton";
import { ImageAnnotator } from "@/components/ImageAnnotator";

export interface LightboxItem { url: string; name?: string | null; caption?: string | null }
const isImg = (u: string) => /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(u.split("?")[0]);
const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)$/i.test(u.split("?")[0]);
const ZOOMS = [1, 2, 3.5];

/**
 * ดูรูปเต็มจอ: ก่อนหน้า/ถัดไป (ปุ่ม · ลูกศร · ปัด) · ซูม (ปุ่ม · แตะสองครั้ง · ถ่างนิ้ว)
 * · แถบรูปย่อมีเลขกำกับ · วาด/แก้ไขแล้วส่งเข้าแชท (ถ้ามี onSendEdited)
 */
export function Lightbox({ items, index, onIndex, onClose, onSendEdited, sendLabel }: {
  items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void;
  onSendEdited?: (file: File, note: string, index: number) => Promise<string | void>;
  sendLabel?: string;
}) {
  const n = items.length;
  const cur = items[index];
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const go = (d: number) => { setZoom(1); onIndex((index + d + n) % n); };
  const touch = useRef<{ x: number; t: number; pinch?: number; z0?: number } | null>(null);
  const lastTap = useRef(0);
  const strip = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(5, z * 1.5)); else if (e.key === "-") setZoom((z) => Math.max(1, z / 1.5));
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  });
  // เลื่อนแถบรูปย่อให้รูปปัจจุบันอยู่กลาง
  useEffect(() => { strip.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [index]);
  // ซูมแล้วให้อยู่กลางภาพ
  useEffect(() => { const a = area.current; if (a && zoom > 1) { a.scrollLeft = (a.scrollWidth - a.clientWidth) / 2; a.scrollTop = (a.scrollHeight - a.clientHeight) / 2; } }, [zoom === 1]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) return null;
  const img = isImg(cur.url);
  const label = cur.caption ?? cur.name ?? "";
  const nextZoom = () => setZoom((z) => ZOOMS[(ZOOMS.findIndex((v) => v >= z - 0.01) + 1) % ZOOMS.length] ?? 1);

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col select-none">
      {/* แถบบน: ลำดับรูปตัวใหญ่ + ปุ่ม */}
      <div className="flex items-center gap-2 p-2 text-white">
        <span className="rounded-xl bg-white text-ink px-3 py-1 font-display font-bold text-lg leading-tight whitespace-nowrap">รูปที่ {index + 1}<span className="text-ink-soft text-sm font-normal"> / {n}</span></span>
        <span className="flex-1 min-w-0 truncate text-sm opacity-80" title={label}>{label}</span>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/15 p-2" title="ปิด (Esc)"><X size={20} /></button>
      </div>

      {/* รูป */}
      <div className="flex-1 min-h-0 relative">
        <div ref={area} className={`absolute inset-0 ${zoom > 1 ? "overflow-auto" : "overflow-hidden flex items-center justify-center"}`}
          onTouchStart={(e) => {
            if (e.touches.length === 2) { const [a, b] = [e.touches[0], e.touches[1]]; touch.current = { x: 0, t: 0, pinch: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z0: zoom }; }
            else touch.current = { x: e.touches[0].clientX, t: Date.now() };
          }}
          onTouchMove={(e) => {
            const t = touch.current; if (!t?.pinch || e.touches.length !== 2) return;
            const [a, b] = [e.touches[0], e.touches[1]];
            setZoom(Math.min(5, Math.max(1, (t.z0 ?? 1) * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / t.pinch)));
          }}
          onTouchEnd={(e) => {
            const t = touch.current; touch.current = null; if (!t || t.pinch) return;
            const dx = e.changedTouches[0].clientX - t.x;
            if (zoom === 1 && Math.abs(dx) > 50 && n > 1) { go(dx < 0 ? 1 : -1); return; }
            if (Math.abs(dx) < 10 && img) { const now = Date.now(); if (now - lastTap.current < 300) { nextZoom(); lastTap.current = 0; } else lastTap.current = now; }
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img ? <img key={cur.url} src={cur.url} alt="" draggable={false} onDoubleClick={nextZoom}
              className={zoom > 1 ? "max-w-none block m-auto" : "w-full h-full object-contain"}
              style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined} />
            : isVideo(cur.url) ? <video key={cur.url} src={cur.url} controls className="max-h-full max-w-full" />
            : <a href={cur.url} target="_blank" rel="noopener" className="btn-primary">เปิดไฟล์ {cur.name ?? ""}</a>}
        </div>
        {n > 1 && <button type="button" onClick={() => go(-1)} className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/45 hover:bg-black/70 ring-1 ring-white/30 text-white p-2" title="ก่อนหน้า (←)"><ChevronLeft size={28} /></button>}
        {n > 1 && <button type="button" onClick={() => go(1)} className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/45 hover:bg-black/70 ring-1 ring-white/30 text-white p-2" title="ถัดไป (→)"><ChevronRight size={28} /></button>}
      </div>

      {/* แถบเครื่องมือ */}
      <div className="flex items-center justify-center gap-2 px-2 pt-2 text-white text-sm">
        {img && <>
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} className="rounded-lg bg-white/15 p-2 disabled:opacity-30" title="ย่อ (-)"><ZoomOut size={20} /></button>
          <span className="w-12 text-center tabular-nums opacity-80">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(5, z * 1.5))} disabled={zoom >= 5} className="rounded-lg bg-white/15 p-2 disabled:opacity-30" title="ขยาย (+) · แตะสองครั้งที่รูปก็ได้"><ZoomIn size={20} /></button>
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-purple px-3 py-2 font-bold flex items-center gap-1.5" title="วาดเส้น / ลูกศร / กรอบบนรูป"><Pencil size={16} /> วาด/แก้ไข</button>
        </>}
        <ShareFileButton url={cur.url} name={cur.name} className="rounded-lg bg-white/15 px-3 py-2" />
        <a href={cur.url} target="_blank" rel="noopener" download className="rounded-lg bg-white/15 p-2" title="เปิด/ดาวน์โหลด"><Download size={20} /></a>
      </div>

      {/* รูปย่อ มีเลขกำกับ */}
      {n > 1 && n <= 60 && (
        <div ref={strip} className="flex gap-1.5 overflow-x-auto p-2">
          {items.map((it, i) => (
            <button key={i} data-i={i} type="button" onClick={() => { setZoom(1); onIndex(i); }}
              className={`relative h-14 w-14 shrink-0 rounded-md overflow-hidden ring-[3px] ${i === index ? "ring-yellow" : "ring-transparent opacity-50 hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {isImg(it.url) ? <img src={it.url} alt="" className="h-full w-full object-cover" /> : <span className="h-full w-full grid place-items-center bg-white/20" />}
              <span className={`absolute left-0 top-0 rounded-br-md px-1.5 text-[11px] font-bold ${i === index ? "bg-yellow text-ink" : "bg-black/70 text-white"}`}>{i + 1}</span>
            </button>
          ))}
        </div>
      )}

      {flash && <div className="absolute left-1/2 top-16 -translate-x-1/2 z-20 rounded-full bg-green text-white px-4 py-2 text-sm font-bold shadow">{flash}</div>}
      {editing && <ImageAnnotator url={cur.url} title={`รูปที่ ${index + 1} ${label}`} sendLabel={sendLabel}
        onSend={onSendEdited ? async (f, note) => { const e = await onSendEdited(f, note, index); if (!e) { setFlash("ส่งรูปที่วาดเข้าแชทแล้ว ✓"); setTimeout(() => setFlash(null), 2500); } return e; } : undefined} onClose={() => setEditing(false)} />}
    </div>
  );
}
