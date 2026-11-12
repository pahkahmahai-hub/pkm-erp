"use client";

import { useState } from "react";
import { Images, Trash2, Upload, Film } from "lucide-react";
import type { TaskFile } from "@/lib/work/types";

const isImg = (u: string) => /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(u.split("?")[0]);

export function Storyboard({ taskId, files, canEdit, addAction, deleteAction }: { taskId: string; files: TaskFile[]; canEdit: boolean; addAction: (fd: FormData) => Promise<void>; deleteAction: (taskId: string, fileId: string) => Promise<void> }) {
  const [big, setBig] = useState<TaskFile | null>(null);
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-display font-bold flex items-center gap-2"><Images size={16} /> Storyboard / รูปอ้างอิง</h2><span className="text-xs text-ink-soft">{files.length} ไฟล์</span></div>
      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {files.map((f, i) => (
            <div key={f.id} className="relative group">
              <button type="button" onClick={() => setBig(f)} className="block w-full aspect-square rounded-lg overflow-hidden bg-cream ring-1 ring-line">
                {isImg(f.url) ? <img src={f.url} alt={f.name ?? ""} className="w-full h-full object-cover" /> : <span className="w-full h-full grid place-items-center text-ink-soft"><Film size={22} /></span>}
              </button>
              <span className="absolute left-1 top-1 rounded bg-ink/70 text-white text-[10px] px-1.5">{i + 1}</span>
              {f.caption && <div className="text-[11px] text-ink-soft mt-0.5 truncate" title={f.caption}>{f.caption}</div>}
              {canEdit && <form action={deleteAction.bind(null, taskId, f.id)} className="absolute right-1 top-1 opacity-0 group-hover:opacity-100"><button className="rounded bg-white/90 text-red p-1 shadow" title="ลบ"><Trash2 size={12} /></button></form>}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <form action={addAction} className="flex flex-wrap items-end gap-2 pt-2 border-t border-line">
          <div className="flex-1 min-w-[200px]"><label className="label">เพิ่มรูป / วิดีโอ (เลือกได้หลายไฟล์)</label><input type="file" name="files" multiple accept="image/*,video/*,.pdf" className="input text-xs" required /></div>
          <div className="w-56"><label className="label">คำอธิบาย (ใส่ให้ทุกไฟล์ที่เลือก)</label><input name="caption" className="input" placeholder="เช่น ฉาก 1 เปิดเรื่อง" /></div>
          <button className="btn-primary py-2"><Upload size={14} /> อัปโหลด</button>
        </form>
      )}
      {big && (
        <div className="fixed inset-0 z-50 bg-ink/80 grid place-items-center p-4" onClick={() => setBig(null)}>
          {isImg(big.url) ? <img src={big.url} alt="" className="max-h-[90vh] max-w-full rounded-lg" /> : <a href={big.url} target="_blank" className="btn-primary">เปิดไฟล์ {big.name}</a>}
          {big.caption && <div className="absolute bottom-6 left-0 right-0 text-center text-white text-sm">{big.caption}</div>}
        </div>
      )}
    </div>
  );
}
