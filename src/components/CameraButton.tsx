"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";

/** ปุ่มเปิดกล้องถ่ายรูป (มือถือเปิดกล้องหลังทันที · คอมจะเปิดหน้าต่างเลือกไฟล์แทน) */
export function CameraButton({ onFiles, className = "btn-outline", label = "ถ่ายรูป", disabled }: { onFiles: (files: File[]) => void; className?: string; label?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onFiles(f); }} />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={className} title="เปิดกล้องถ่ายรูป"><Camera size={16} />{label && <span className="ml-1">{label}</span>}</button>
    </>
  );
}
