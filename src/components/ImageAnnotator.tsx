"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, Trash2, Send, Download, X, Pencil, Square, MoveUpRight, Loader2 } from "lucide-react";

type Tool = "pen" | "rect" | "arrow";
type Stroke = { tool: Tool; color: string; width: number; pts: [number, number][] };
const COLORS = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ffffff", "#111111"];
const SIZES = [{ k: "S", w: 0.004 }, { k: "M", w: 0.008 }, { k: "L", w: 0.016 }];   // สัดส่วนของด้านยาวรูป

/** วาด/เขียนทับรูป แล้วส่งเข้าแชทหรือดาวน์โหลด */
export function ImageAnnotator({ url, title, onSend, sendLabel = "ส่งเข้าแชท", onClose }: {
  url: string; title?: string;
  onSend?: (file: File, note: string) => Promise<string | void>;   // คืนข้อความ error ถ้าส่งไม่สำเร็จ
  sendLabel?: string; onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState<"loading" | "ok" | "error">("loading");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // โหลดรูปแบบ CORS เพื่อให้ export จาก canvas ได้
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const max = 2000, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = canvas.current!; c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      img.current = im; setReady("ok");
    };
    im.onerror = () => setReady("error");
    im.src = url + (url.includes("?") ? "&" : "?") + "cors=1";
  }, [url]);

  function draw(list: Stroke[]) {
    const c = canvas.current, im = img.current; if (!c || !im) return;
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0, c.width, c.height);
    const L = Math.max(c.width, c.height);
    for (const s of list) {
      g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = s.width * L; g.lineCap = "round"; g.lineJoin = "round";
      const p = s.pts; if (!p.length) continue;
      if (s.tool === "pen") {
        g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]);
        if (p.length === 1) g.lineTo(p[0][0] + 0.1, p[0][1]); g.stroke();
      } else {
        const [a, b] = [p[0], p[p.length - 1]];
        if (s.tool === "rect") g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        else {
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = Math.max(s.width * L * 4, 14);
          g.beginPath(); g.moveTo(b[0], b[1]);
          g.lineTo(b[0] - h * Math.cos(ang - 0.45), b[1] - h * Math.sin(ang - 0.45));
          g.lineTo(b[0] - h * Math.cos(ang + 0.45), b[1] - h * Math.sin(ang + 0.45)); g.closePath(); g.fill();
        }
      }
    }
  }
  useEffect(() => { if (ready === "ok") draw(strokes); }, [ready, strokes]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent): [number, number] => {
    const c = canvas.current!, r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
  };
  const down = (e: React.PointerEvent) => {
    if (ready !== "ok") return;
    (e.target as Element).setPointerCapture(e.pointerId);
    cur.current = { tool, color, width: SIZES[size].w, pts: [pos(e)] };
    draw([...strokes, cur.current]);
  };
  const move = (e: React.PointerEvent) => {
    if (!cur.current) return;
    const p = pos(e);
    if (cur.current.tool === "pen") cur.current.pts.push(p); else cur.current.pts = [cur.current.pts[0], p];
    draw([...strokes, cur.current]);
  };
  const up = () => { if (cur.current) { const s = cur.current; cur.current = null; setStrokes((x) => [...x, s]); } };

  const toFile = () => new Promise<File>((res, rej) => canvas.current!.toBlob((b) => (b ? res(new File([b], `edit-${Date.now()}.jpg`, { type: "image/jpeg" })) : rej(new Error("สร้างรูปไม่สำเร็จ"))), "image/jpeg", 0.9));
  async function send() {
    if (!onSend || busy) return;
    setBusy(true); setErr(null);
    try {
      const e = await onSend(await toFile(), note.trim());
      if (e) setErr(e); else onClose();
    } catch (x) { setErr((x as Error).message || "ส่งไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function download() {
    const f = await toFile(); const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button type="button" onClick={() => setTool(t)} title={label} className={`rounded-lg p-2 ${tool === t ? "bg-white text-ink" : "bg-white/15 text-white"}`}>{icon}</button>
  );
  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center gap-2 p-2 text-white text-sm">
        <span className="font-bold flex items-center gap-1.5"><Pencil size={16} /> วาด / แก้ไขรูป</span>
        <span className="flex-1 truncate opacity-70">{title}</span>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/15 p-2" title="ปิด"><X size={18} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
        {toolBtn("pen", <Pencil size={18} />, "ปากกา")}
        {toolBtn("arrow", <MoveUpRight size={18} />, "ลูกศร")}
        {toolBtn("rect", <Square size={18} />, "กรอบสี่เหลี่ยม")}
        <span className="w-px h-6 bg-white/20 mx-1" />
        {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ring-2 ${color === c ? "ring-white scale-110" : "ring-white/20"}`} style={{ background: c }} title="สี" />)}
        <span className="w-px h-6 bg-white/20 mx-1" />
        {SIZES.map((s, i) => <button key={s.k} type="button" onClick={() => setSize(i)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${size === i ? "bg-white text-ink" : "bg-white/15 text-white"}`} title="ขนาดเส้น">{s.k}</button>)}
        <span className="w-px h-6 bg-white/20 mx-1" />
        <button type="button" onClick={() => setStrokes((x) => x.slice(0, -1))} disabled={!strokes.length} className="rounded-lg bg-white/15 text-white p-2 disabled:opacity-30" title="ย้อนกลับ"><Undo2 size={18} /></button>
        <button type="button" onClick={() => setStrokes([])} disabled={!strokes.length} className="rounded-lg bg-white/15 text-white p-2 disabled:opacity-30" title="ล้างทั้งหมด"><Trash2 size={18} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-1">
        {ready === "loading" && <Loader2 className="animate-spin text-white" />}
        {ready === "error" && <div className="text-white text-sm text-center p-4">เปิดรูปนี้เพื่อวาดไม่ได้ — ลองดาวน์โหลดแล้วส่งใหม่ครับ</div>}
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          className={`max-h-full max-w-full object-contain touch-none cursor-crosshair ${ready === "ok" ? "" : "hidden"}`} />
      </div>
      <div className="p-2 space-y-1.5">
        {err && <div className="text-red-300 text-xs">{err}</div>}
        <div className="flex gap-2">
          {onSend && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="พิมพ์ข้อความแนบ เช่น แก้สีตรงนี้" className="flex-1 min-w-0 rounded-lg bg-white/10 text-white placeholder:text-white/50 px-3 py-2 text-sm outline-none" />}
          <button type="button" onClick={download} disabled={ready !== "ok"} className="rounded-lg bg-white/15 text-white px-3 py-2 disabled:opacity-30" title="ดาวน์โหลดรูปที่วาด"><Download size={18} /></button>
          {onSend && <button type="button" onClick={send} disabled={ready !== "ok" || busy} className="rounded-lg bg-purple text-white px-4 py-2 font-bold flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sendLabel}</button>}
        </div>
      </div>
    </div>
  );
}
