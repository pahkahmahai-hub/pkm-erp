"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, Trash2, Undo2, FileText } from "lucide-react";
import { uploadRoomFiles } from "@/lib/work/upload";
import { addCorpItemImages, approveCorpImage, unapproveCorpImage, deleteCorpImage } from "@/app/(app)/work/actions";
import { IMAGE_KINDS, type CorpImage, type ImageKind } from "@/lib/work/corpSpec";
import { CameraButton } from "@/components/CameraButton";
import { Lightbox } from "@/components/Lightbox";

/** รูปของรายการสินค้า แยกตามประเภท · อัปโหลด / ลูกค้าคอนเฟิร์ม (ล็อกเข้า Spec Sheet) */
export function CorpItemImages({ itemId, orderId, roomId, images, canCorp, canManage, meId }: { itemId: string; orderId: string; roomId: string; images: CorpImage[]; canCorp: boolean; canManage: boolean; meId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<ImageKind>("mockup");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [approving, setApproving] = useState<CorpImage | null>(null);
  const [note, setNote] = useState("");
  const [, start] = useTransition();
  const [lb, setLb] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const evRef = useRef<HTMLInputElement>(null);
  const list = images.filter((i) => i.kind === kind);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setErr(null);
    try {
      const up = await uploadRoomFiles(roomId, files, (d, t) => setBusy(`อัปโหลด ${d}/${t}…`));
      setBusy("บันทึก…");
      const r = await addCorpItemImages(itemId, orderId, kind, up);
      if (r.error) throw new Error(r.error);
      start(() => router.refresh());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const approve = async () => {
    if (!approving) return;
    setErr(null);
    try {
      let ev: string | null = null;
      const f = evRef.current?.files?.[0];
      if (f) { setBusy("อัปโหลดหลักฐาน…"); ev = (await uploadRoomFiles(roomId, [f]))[0]?.url ?? null; }
      setBusy("บันทึก…");
      const r = await approveCorpImage(approving.id, orderId, ev, note || null);
      if (r.error) throw new Error(r.error);
      setApproving(null); setNote("");
      start(() => router.refresh());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const isImg = (u: string) => /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(u);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {IMAGE_KINDS.map((k) => {
          const n = images.filter((i) => i.kind === k.key).length; const ok = images.some((i) => i.kind === k.key && i.status === "approved");
          return <button key={k.key} type="button" onClick={() => setKind(k.key)} className={`rounded-full px-3 py-1 text-xs border ${kind === k.key ? "bg-purple text-white border-purple" : "border-line hover:bg-cream"}`}>{ok && "✓ "}{k.label}{n ? ` (${n})` : ""}</button>;
        })}
      </div>
      <div className="text-[11px] text-ink-soft">{IMAGE_KINDS.find((k) => k.key === kind)?.hint}</div>
      <div className="flex flex-wrap gap-2">
        {list.map((im) => (
          <div key={im.id} className={`relative w-28 rounded-xl overflow-hidden border-2 ${im.status === "approved" ? "border-green" : "border-line"}`}>
            <a href={im.url} target="_blank" rel="noopener" className="block h-28 bg-cream" onClick={(e) => { e.preventDefault(); setLb(list.indexOf(im)); }}>
              {isImg(im.url) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={im.url} alt="" className="h-full w-full object-cover" /> : <span className="h-full grid place-items-center text-xs p-2 text-center"><FileText size={20} />{im.caption ?? "ไฟล์"}</span>}
            </a>
            <div className="p-1 text-[10px] space-y-1">
              {im.status === "approved"
                ? <div className="text-green font-semibold flex items-center gap-1"><CheckCircle2 size={11} /> ลูกค้าคอนเฟิร์ม{im.evidence_url && <a href={im.evidence_url} target="_blank" rel="noopener" className="underline ml-auto">หลักฐาน</a>}</div>
                : canCorp && <button type="button" onClick={() => { setApproving(im); setNote(""); }} className="w-full rounded bg-green/15 text-green font-semibold py-0.5">ลูกค้าคอนเฟิร์ม</button>}
              {im.evidence_note && <div className="text-ink-soft truncate" title={im.evidence_note}>{im.evidence_note}</div>}
              <div className="flex justify-end gap-2">
                {im.status === "approved" && canManage && <button type="button" title="ยกเลิกคอนเฟิร์ม (แก้แบบ)" onClick={() => { if (confirm("ยกเลิกคอนเฟิร์มรูปนี้?")) start(async () => { const r = await unapproveCorpImage(im.id, orderId); if (r.error) setErr(r.error); router.refresh(); }); }} className="text-ink-soft hover:text-purple"><Undo2 size={12} /></button>}
                {im.status !== "approved" && (canManage || im.created_by === meId) && <button type="button" title="ลบ" onClick={() => { if (confirm("ลบรูปนี้?")) start(async () => { const r = await deleteCorpImage(im.id, orderId); if (r.error) setErr(r.error); router.refresh(); }); }} className="text-ink-soft hover:text-red"><Trash2 size={12} /></button>}
              </div>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1.5 justify-center">
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; upload(f); }} />
          <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className="btn-outline text-xs py-1.5">{busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ?? "เพิ่มรูป"}</button>
          <CameraButton disabled={!!busy} className="btn-outline text-xs py-1.5" onFiles={upload} />
        </div>
      </div>
      {err && <div className="text-xs text-red">{err}</div>}
      {lb !== null && <Lightbox items={list.map((i) => ({ url: i.url, caption: i.status === "approved" ? "✓ ลูกค้าคอนเฟิร์ม" : i.caption }))} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
      {approving && (
        <div className="fixed inset-0 z-50 bg-ink/50 grid place-items-center p-4" onClick={() => setApproving(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold">ลูกค้าคอนเฟิร์มรูปนี้</h3>
            <p className="text-xs text-ink-soft">รูปจะถูกล็อกเข้าใบงานสั่งสินค้า (Rev. +1) และติ๊กขั้นตอน “ลูกค้าคอนเฟิร์ม…” ให้อัตโนมัติ</p>
            <div><label className="label">หลักฐาน (แคปแชท LINE / อีเมล / เอกสารเซ็น) — ไม่บังคับ</label><input ref={evRef} type="file" accept="image/*,application/pdf" className="input text-xs" /></div>
            <div><label className="label">หมายเหตุ</label><input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="เช่น คุณเอ คอนเฟิร์มทาง LINE 17/11" /></div>
            <div className="flex gap-2"><button type="button" disabled={!!busy} onClick={approve} className="btn-primary flex-1">{busy ?? "บันทึกคอนเฟิร์ม"}</button><button type="button" onClick={() => setApproving(null)} className="btn-outline">ยกเลิก</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
