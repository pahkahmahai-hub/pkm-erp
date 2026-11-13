"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Loader2 } from "lucide-react";
import { uploadExpenseFiles } from "@/lib/expenses/upload";
import { attachExpenseFiles } from "@/app/(app)/expenses/actions";

/** แนบสลิป/ไฟล์เพิ่มให้รายการที่มีอยู่ */
export function AttachExpenseFiles({ id }: { id: string }) {
  const router = useRouter(); const inp = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"slip" | "bill">("slip"); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async (files: File[]) => {
    if (!files.length) return; setBusy(true); setErr(null);
    try { const up = await uploadExpenseFiles(files, kind); const r = await attachExpenseFiles(id, up.map((u) => ({ path: u.path, kind }))); if (r.error) throw new Error(r.error); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 text-xs">{(["slip", "bill"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-2.5 py-0.5 border ${kind === k ? "bg-purple text-white border-purple" : "border-line"}`}>{k === "slip" ? "สลิปโอน" : "รูปบิล"}</button>)}</div>
      <button type="button" disabled={busy} onClick={() => inp.current?.click()} className="btn-outline w-full text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />} แนบ{kind === "slip" ? "สลิปโอนเงิน" : "รูปบิลเพิ่ม"}</button>
      <input ref={inp} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { go(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      {err && <div className="text-xs text-red">{err}</div>}
    </div>
  );
}
