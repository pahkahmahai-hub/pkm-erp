"use client";

import Link from "next/link";

// แสดงข้อความ error จริงแทนหน้า "This page couldn't load" ของ Vercel เพื่อให้แก้ได้เร็ว
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto mt-12 card p-6 space-y-3">
      <h1 className="font-display text-xl font-bold text-red">หน้านี้โหลดไม่ได้</h1>
      <p className="text-sm break-words font-mono bg-cream rounded-lg p-3">{error.message}</p>
      {error.digest && <p className="text-[11px] text-ink-soft">digest: {error.digest}</p>}
      <div className="flex gap-2"><button onClick={reset} className="btn-primary">ลองใหม่</button><Link href="/" className="btn-outline">โปรแกรมทั้งหมด</Link></div>
      <p className="text-xs text-ink-soft">ถ้าเป็นข้อความเกี่ยวกับตารางหรือฟังก์ชันที่ไม่มี (relation / function does not exist) แปลว่ายังไม่ได้รัน SQL ล่าสุดใน Supabase</p>
    </div>
  );
}
