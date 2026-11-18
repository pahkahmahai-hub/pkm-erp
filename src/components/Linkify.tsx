"use client";

import type { ReactNode } from "react";

// http(s)://… หรือ www.… (ตัดเครื่องหมายวรรคตอนท้ายลิงก์ออก)
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}”’])/gi;

/** แปลงข้อความ → ลิงก์ที่กดได้ (เปิดแท็บใหม่) */
export function linkify(text: string, keyPrefix = "l"): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.startsWith("www.") ? `https://${part}` : part;
    return (
      <a key={`${keyPrefix}${i}`} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        className="text-blue underline underline-offset-2 break-all hover:opacity-80">{part}</a>
    );
  });
}

export function Linkify({ text }: { text: string }) { return <>{linkify(text)}</>; }

/** YouTube video id จากข้อความ (ถ้ามี) — ใช้ทำรูปตัวอย่าง */
export function youtubeId(text: string): string | null {
  const m = text.match(/(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? m[1] : null;
}
