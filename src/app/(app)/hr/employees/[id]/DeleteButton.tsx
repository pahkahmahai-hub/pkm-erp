"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteEmployee } from "../actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-red hover:bg-red/10"><Trash2 size={16} /> ลบพนักงาน</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
          <div className="card p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-lg text-red">ลบ {name} ออกจากระบบ?</h3>
            <p className="text-sm text-ink-soft">
              การลบจะเอาข้อมูลพนักงาน บัญชีเข้าระบบ และประวัติเช็คอิน / ใบลา / OT ทั้งหมดของคนนี้ออก <b>กู้คืนไม่ได้</b>
              <br />ถ้าพนักงานลาออก แนะนำเปลี่ยนสถานะเป็น "ลาออกแล้ว" แทน เพื่อเก็บประวัติไว้ทำรายงานย้อนหลัง
            </p>
            <div>
              <label className="label">พิมพ์ <span className="font-mono text-red">ลบ</span> เพื่อยืนยัน</label>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} className="input" autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">ยกเลิก</button>
              <button type="button" disabled={typed !== "ลบ" || pending} onClick={() => start(() => deleteEmployee(id))} className="btn-danger">
                {pending ? "กำลังลบ…" : "ลบถาวร"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
