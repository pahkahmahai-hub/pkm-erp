"use client";

import { useState } from "react";
import { Images, Trash2, Upload, Film, Camera } from "lucide-react";
import type { TaskFile } from "@/lib/work/types";
import { Lightbox } from "@/components/Lightbox";
import { uploadChatFile } from "@/lib/work/upload";
import { postComment } from "@/app/(app)/work/actions";

const isImg = (u: string) => /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(u.split("?")[0]);

export function Storyboard({ taskId, files, canEdit, addAction, deleteAction }: { taskId: string; files: TaskFile[]; canEdit: boolean; addAction: (fd: FormData) => Promise<void>; deleteAction: (taskId: string, fileId: string) => Promise<void> }) {
  const [idx, setIdx] = useState<number | null>(null);
  // วาด/แก้ไขรูปแล้วส่งเป็นคอมเมนต์ในงานนี้
  async function sendEdited(file: File, note: string, i: number): Promise<string | void> {
    const up = await uploadChatFile(`chat/${taskId}`, file);
    const fd = new FormData();
    fd.set("body", `✏️ แก้ไข Storyboard รูปที่ ${i + 1}${files[i]?.caption ? ` (${files[i].caption})` : ""}${note ? `\n${note}` : ""}`);
    fd.set("mentions", "[]");
    fd.set("uploaded_url", up.url); fd.set("uploaded_name", up.name); fd.set("uploaded_is_image", "1");
    const res = await postComment(taskId, fd);
    if (res.error) return res.error;
  }
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-display font-bold flex items-center gap-2"><Images size={16} /> Storyboard / รูปอ้างอิง</h2><span className="text-xs text-ink-soft">{files.length} ไฟล์</span></div>
      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {files.map((f, i) => (
            <div key={f.id} className="relative group">
              <button type="button" onClick={() => setIdx(i)} className="block w-full aspect-square rounded-lg overflow-hidden bg-cream ring-1 ring-line">
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
          <div className="flex-1 min-w-[200px]"><label className="label">เพิ่มรูป / วิดีโอ (เลือกได้หลายไฟล์)</label><input type="file" name="files" multiple accept="image/*,video/*,.pdf" className="input text-xs" /></div>
          <div className="w-56"><label className="label">คำอธิบาย (ใส่ให้ทุกไฟล์ที่เลือก)</label><input name="caption" className="input" placeholder="เช่น ฉาก 1 เปิดเรื่อง" /></div>
          <label className="btn-outline py-2 cursor-pointer" title="เปิดกล้องถ่ายรูป"><Camera size={14} /> ถ่ายรูป<input type="file" name="files" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files?.length) e.currentTarget.form?.requestSubmit(); }} /></label>
          <button className="btn-primary py-2"><Upload size={14} /> อัปโหลด</button>
        </form>
      )}
      {idx !== null && <Lightbox items={files.map((f) => ({ url: f.url, name: f.name, caption: f.caption }))} index={idx} onIndex={setIdx} onClose={() => setIdx(null)} onSendEdited={sendEdited} sendLabel="ส่งเข้าคอมเมนต์" />}
    </div>
  );
}
