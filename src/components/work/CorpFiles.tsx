"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, FileText, Trash2, Upload, Loader2 } from "lucide-react";
import { uploadRoomFiles } from "@/lib/work/upload";
import { addCorpFiles, deleteCorpFile } from "@/app/(app)/work/actions";
import type { CorpFile } from "@/lib/work/corp";

/** ไฟล์แนบออเดอร์ Corporate: โลโก้ลูกค้า artwork ใบเสนอราคา PO ลูกค้า รูปงาน */
export function CorpFiles({ orderId, roomId, files, meId, canManage }: { orderId: string; roomId: string; files: CorpFile[]; meId: string; canManage: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [, start] = useTransition();

  const upload = async (list: File[]) => {
    if (!list.length) return;
    setErr(null);
    try {
      const up = await uploadRoomFiles(roomId, list, (d, t) => setBusy(`อัปโหลด ${d}/${t}…`));
      setBusy("บันทึก…");
      const r = await addCorpFiles(orderId, up);
      if (r.error) throw new Error(r.error);
      start(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); if (input.current) input.current.value = ""; }
  };
  const remove = (f: CorpFile) => {
    if (!confirm(`ลบไฟล์ "${f.name ?? "ไฟล์"}"?`)) return;
    start(async () => { const r = await deleteCorpFile(orderId, f.id); if (r.error) setErr(r.error); else router.refresh(); });
  };
  const imgs = files.filter((f) => f.is_image); const docs = files.filter((f) => !f.is_image);

  return (
    <div className="card p-5 space-y-3"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(Array.from(e.dataTransfer.files)); }}>
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold flex items-center gap-2"><Paperclip size={16} /> ไฟล์แนบ ({files.length})</h3>
        <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className="btn-outline py-1 px-3 text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ?? "แนบไฟล์"}</button>
      </div>
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(Array.from(e.target.files ?? []))} />
      <div className={`rounded-xl border-2 border-dashed px-3 py-2 text-[11px] text-ink-soft ${drag ? "border-purple bg-purple/5" : "border-line"}`}>ลากไฟล์มาวางได้ — โลโก้ลูกค้า, artwork, ใบเสนอราคา, PO ลูกค้า, รูปงานก่อนส่ง</div>
      {err && <div className="text-xs text-red">{err}</div>}
      {docs.length > 0 && <ul className="space-y-1">{docs.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-sm"><FileText size={15} className="text-purple shrink-0" /><a href={f.url} target="_blank" rel="noreferrer" className="hover:underline truncate flex-1">{f.name ?? "ไฟล์"}</a>
          {(canManage || f.created_by === meId) && <button type="button" onClick={() => remove(f)} className="text-ink-soft hover:text-red"><Trash2 size={13} /></button>}</li>))}</ul>}
      {imgs.length > 0 && <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{imgs.map((f) => (
        <div key={f.id} className="group relative">
          <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-line bg-cream">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.name ?? ""} className="w-full h-full object-cover" />
          </a>
          {(canManage || f.created_by === meId) && <button type="button" onClick={() => remove(f)} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-ink-soft hover:text-red opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>}
        </div>))}</div>}
    </div>
  );
}
