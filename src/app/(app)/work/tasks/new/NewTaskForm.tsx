"use client";

import { useMemo, useState } from "react";
import type { Room, RoomMember } from "@/lib/work/types";

type Emp = { id: string; first_name: string; nickname: string | null; emp_code: string };

export function NewTaskForm({ rooms, members, allEmployees, initialRoomKey, isAdmin, initialTitle, fromMessage, initialAssignee }: { rooms: Room[]; members: RoomMember[]; allEmployees: Emp[]; initialRoomKey?: string; isAdmin: boolean; initialTitle?: string; fromMessage?: string; initialAssignee?: string }) {
  const [roomId, setRoomId] = useState(rooms.find((r) => r.key === initialRoomKey)?.id ?? rooms[0]?.id ?? "");
  const isSwRoom = rooms.find((r) => r.id === roomId)?.key === "sw-room";
  const options = useMemo(() => {
    const inRoom = members.filter((m) => m.room_id === roomId).map((m) => m.employees).filter(Boolean) as Emp[];
    if (isAdmin) {
      const ids = new Set(inRoom.map((e) => e.id));
      return [...inRoom, ...allEmployees.filter((e) => !ids.has(e.id))];
    }
    return inRoom;
  }, [roomId, members, allEmployees, isAdmin]);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <label className="label">ห้องงาน *</label>
        <select name="room_id" value={roomId} onChange={(e) => setRoomId(e.target.value)} className="input" required>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">มอบหมายให้</label>
        <select name="assignee_id" className="input" defaultValue={initialAssignee ?? ""}>
          <option value="">— ยังไม่ระบุ —</option>
          {options.map((e) => <option key={e.id} value={e.id}>{e.nickname ? `${e.nickname} (${e.first_name})` : e.first_name}</option>)}
        </select>
      </div>
      <div className="md:col-span-2"><label className="label">ชื่องาน *</label><input name="title" defaultValue={initialTitle ?? ""} className="input" required autoFocus placeholder="เช่น ออกแบบกล่องของขวัญปีใหม่ 2570" />{fromMessage && <input type="hidden" name="from_message" value={fromMessage} />}</div>
      <div className="md:col-span-2"><label className="label">รายละเอียด</label><textarea name="description" className="input" rows={3} placeholder="อธิบายสิ่งที่ต้องการ ขนาด จำนวน ลิงก์อ้างอิง…" /></div>
      {isSwRoom ? (<>
        <div><label className="label">① กำหนดจัดของเสร็จ</label><input name="due_date" type="date" className="input" /></div>
        <div><label className="label">② กำหนดส่งถึงห้าง <span className="font-normal text-ink-soft">(ว่าง = จัดเสร็จ +2 วัน)</span></label><input name="arrive_due" type="date" className="input" /></div>
        <p className="md:col-span-2 text-[11px] text-ink-soft -mt-2">③ กำหนดอัพเข้าระบบ = วันที่กด “สินค้าถึงแล้ว” + 7 วัน (รอ PC อัพ) — ระบบนับให้อัตโนมัติ</p>
      </>) : <div><label className="label">กำหนดเสร็จ</label><input name="due_date" type="date" className="input" /></div>}
      <div>
        <label className="label">ความสำคัญ</label>
        <div className="flex gap-4 py-2 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="priority" value="normal" defaultChecked className="accent-purple" /> ปกติ</label>
          <label className="flex items-center gap-2"><input type="radio" name="priority" value="urgent" className="accent-purple" /> 🔥 ด่วน</label>
        </div>
      </div>
      <div className="md:col-span-2">
        <label className="label">เช็คลิสต์ย่อย (บรรทัดละ 1 ข้อ — ไม่บังคับ)</label>
        <textarea name="checklist" className="input font-mono text-sm" rows={3} placeholder={"ทำ ASN\nStamp ใบส่งของเข้าระบบ\nส่งของถึงห้าง"} />
      </div>
      <div className="md:col-span-2 flex gap-3">
        <button className="btn-primary">สั่งงาน</button>
        <a href="/work" className="btn-ghost">ยกเลิก</a>
      </div>
    </div>
  );
}
