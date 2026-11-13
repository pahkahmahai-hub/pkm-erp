"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, FileText, Trash2, Upload, Image as ImageIcon, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { addPurchaseFiles, deletePurchaseFile, type PurchaseFileIn } from "@/app/(app)/purchase/actions";
import type { PurchaseFile } from "@/lib/purchase/files";

const MAX = 10 * 1024 * 1024;
const KIND_TH = { quote: "ใบเสนอราคา", image: "รูปภาพ", other: "เอกสารอื่น" } as const;
const fmtSize = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtWhen = (s: string) => new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function PurchaseFiles({ docId, files, meId, isAdmin }: { docId: string; files: PurchaseFile[]; meId: string; isAdmin: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"quote" | "image" | "other">("quote");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [, start] = useTransition();

  const upload = async (list: File[]) => {
    if (!list.length) return;
    setErr(null);
    const supabase = createClient();
    const out: PurchaseFileIn[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(`กำลังอัปโหลด ${i + 1}/${list.length}…`);
        const raw = list[i];
        const isImg = raw.type.startsWith("image/");
        const f = isImg ? await compressImage(raw, 2200, 0.85) : raw;
        if (f.size > MAX) throw new Error(`"${raw.name}" ใหญ่เกิน 10 MB`);
        const ext = (raw.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const path = `${docId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${isImg ? (f.type === "image/jpeg" ? "jpg" : ext) : ext}`;
        const { error } = await supabase.storage.from("purchase-files").upload(path, f, { contentType: f.type || undefined });
        if (error) throw new Error(error.message);
        out.push({ path, name: raw.name, mime: f.type || null, size: f.size, kind: kind === "quote" || !isImg ? kind : "image" });
      }
      const r = await addPurchaseFiles(docId, out, note.trim() || null);
      if (r.error) throw new Error(r.error);
      setNote("");
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = (f: PurchaseFile) => {
    if (!confirm(`ลบไฟล์ "${f.file_name}"?`)) return;
    setBusy("กำลังลบ…");
    start(async () => {
      const r = await deletePurchaseFile(f.id, docId);
      setBusy(null);
      if (r.error) setErr(r.error); else router.refresh();
    });
  };

  const images = files.filter((f) => f.is_image);
  const docs = files.filter((f) => !f.is_image);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold flex items-center gap-2"><Paperclip size={16} /> ไฟล์แนบ ({files.length})</h3>
        <span className="text-[11px] text-ink-soft">เห็นเฉพาะผู้บริหารและผู้สร้างเอกสาร</span>
      </div>

      {/* upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(Array.from(e.dataTransfer.files)); }}
        className={`rounded-xl border-2 border-dashed p-3 space-y-2 transition ${drag ? "border-purple bg-purple/5" : "border-line"}`}
      >
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(Object.keys(KIND_TH) as (keyof typeof KIND_TH)[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1 border ${kind === k ? "bg-purple text-white border-purple" : "border-line hover:bg-cream"}`}>{KIND_TH[k]}</button>
          ))}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="input text-sm" placeholder="หมายเหตุ (ถ้ามี) เช่น ใบเสนอราคาเจ้า A ราคาดีสุด / รูปตัวอย่างผ้า" />
        <div className="flex items-center gap-2">
          <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className="btn-outline text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {busy ?? "เลือกไฟล์"}</button>
          <span className="text-[11px] text-ink-soft">หรือลากไฟล์มาวาง · PDF / รูป / Excel / Word · ไม่เกิน 10 MB ต่อไฟล์</span>
        </div>
        <input ref={input} type="file" multiple hidden accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,.doc,.docx" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
        {err && <div className="text-xs text-red">{err}</div>}
      </div>

      {/* documents */}
      {docs.length > 0 && (
        <ul className="divide-y divide-line">
          {docs.map((f) => (
            <li key={f.id} className="py-2 flex items-start gap-3 text-sm">
              <FileText size={18} className="text-purple shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <a href={f.url} target="_blank" rel="noreferrer" className="font-medium hover:underline break-all">{f.file_name}</a>
                <div className="text-[11px] text-ink-soft flex flex-wrap gap-x-2">
                  <span className="rounded bg-cream px-1.5">{KIND_TH[f.kind]}</span>
                  {f.from_doc_no && <span className="text-teal font-semibold">จาก {f.from_doc_no}</span>}
                  <span>{fmtWhen(f.created_at)}</span><span>{fmtSize(f.size_bytes)}</span>
                </div>
                {f.note && <div className="text-xs mt-0.5">{f.note}</div>}
              </div>
              {(isAdmin || f.uploaded_by === meId) && !f.from_doc_no && <button type="button" onClick={() => remove(f)} className="text-ink-soft hover:text-red p-1" aria-label="ลบ"><Trash2 size={14} /></button>}
            </li>
          ))}
        </ul>
      )}

      {/* images */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((f) => (
            <div key={f.id} className="group relative">
              <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-line bg-cream" title={[f.file_name, f.note].filter(Boolean).join(" — ")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.file_name} className="w-full h-full object-cover" />
              </a>
              <div className="text-[10px] text-ink-soft truncate mt-0.5">{f.from_doc_no ? `จาก ${f.from_doc_no} · ` : ""}{f.note ?? fmtWhen(f.created_at)}</div>
              {(isAdmin || f.uploaded_by === meId) && !f.from_doc_no && <button type="button" onClick={() => remove(f)} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-ink-soft hover:text-red opacity-0 group-hover:opacity-100" aria-label="ลบ"><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      )}

      {!files.length && <p className="text-xs text-ink-soft flex items-center gap-1"><ImageIcon size={12} /> ยังไม่มีไฟล์แนบ</p>}
    </div>
  );
}
