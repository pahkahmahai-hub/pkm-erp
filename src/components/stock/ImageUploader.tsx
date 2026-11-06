"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Upload } from "lucide-react";

/** Clear "choose image" button + preview; uploads automatically via the given server action. */
export function ImageUploader({ action, current }: { action: (fd: FormData) => Promise<void>; current: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("ไฟล์ใหญ่เกิน 5 MB"); return; }
    setErr(null);
    setPreview(URL.createObjectURL(f));
    const fd = new FormData();
    fd.set("image", f);
    start(async () => {
      try { await action(fd); } catch (e) { setErr((e as Error).message); }
    });
  }

  const src = preview ?? current;
  return (
    <div className="space-y-3">
      {src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" className="w-full aspect-square object-cover rounded-xl" /> : <div className="w-full aspect-square rounded-xl bg-lavender/30 grid place-items-center text-ink-soft text-sm"><Camera size={28} /></div>}
      <input ref={ref} type="file" accept="image/*" onChange={onChange} className="hidden" />
      <button type="button" onClick={() => ref.current?.click()} disabled={pending} className="btn-outline w-full">
        <Upload size={16} /> {pending ? "กำลังอัปโหลด…" : src ? "เปลี่ยนรูป" : "เลือกรูปภาพ"}
      </button>
      <p className="text-[11px] text-ink-soft text-center">jpg / png ไม่เกิน 5 MB — ถ่ายจากมือถือได้</p>
      {err && <p className="text-xs text-red">{err}</p>}
    </div>
  );
}
