"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

export function ConfirmDelete({ action, label, warning }: { action: () => Promise<void>; label: string; warning: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-red hover:bg-red/10"><Trash2 size={16} /> {label}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
          <div className="card p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-lg text-red">{label}?</h3>
            <p className="text-sm text-ink-soft">{warning}</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">ยกเลิก</button>
              <button type="button" disabled={pending} onClick={() => start(() => action())} className="btn-danger">{pending ? "กำลังลบ…" : "ลบ"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
