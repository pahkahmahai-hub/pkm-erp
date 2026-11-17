"use client";

import { useState } from "react";
import { Share2, Loader2 } from "lucide-react";

/** แชร์รูป/ไฟล์ไปแอปอื่น (LINE, Gmail, ฯลฯ) ผ่านเมนูแชร์ของเครื่อง
 *  ถ้าเครื่องไม่รองรับการแชร์ไฟล์ → แชร์ลิงก์ / คัดลอกลิงก์แทน */
export function ShareFileButton({ url, name, title, className = "", label = "แชร์" }: { url: string; name?: string | null; title?: string; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const fname = name || decodeURIComponent(url.split("?")[0].split("/").pop() || "file");
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], fname, { type: blob.type || "application/octet-stream" });
        if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: title ?? fname }); return; }
      } catch (err) { if ((err as Error).name === "AbortError") return; }
      if (nav.share) { await nav.share({ url, title: title ?? fname }); return; }
      await navigator.clipboard.writeText(url);
      setMsg("คัดลอกลิงก์แล้ว"); setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      if ((err as Error).name !== "AbortError") { setMsg("แชร์ไม่ได้"); setTimeout(() => setMsg(null), 2000); }
    } finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={go} className={`inline-flex items-center gap-1 ${className}`} title="แชร์ไปแอปอื่น (LINE, Gmail …)">
      {busy ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}<span className="underline">{msg ?? label}</span>
    </button>
  );
}
