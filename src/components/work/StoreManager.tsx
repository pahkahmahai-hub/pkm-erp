"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Search, X } from "lucide-react";
import type { DeliveryStore } from "@/lib/work/deliveries";
import { saveDeliveryStore, deleteDeliveryStore } from "@/app/(app)/work/actions";

type ContactLite = { id: string; name: string; code: string | null };
const COLORS = ["#452a79", "#0363b1", "#00856b", "#06acb4", "#e74f99", "#e42213", "#c2410c", "#8a5a00", "#2f6b4f", "#6b7280"];

export function StoreManager({ stores, contacts }: { stores: DeliveryStore[]; contacts: ContactLite[] }) {
  const [editing, setEditing] = useState<DeliveryStore | null | "new">(null);
  const active = stores.filter((s) => s.is_active); const closed = stores.filter((s) => !s.is_active);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button type="button" onClick={() => setEditing("new")} className="btn-primary"><Plus size={16} /> เพิ่มห้าง</button></div>
      {editing && <StoreForm store={editing === "new" ? null : editing} contacts={contacts} onClose={() => setEditing(null)} />}
      <StoreTable title={`ห้างที่เปิดอยู่ (${active.length})`} list={active} contacts={contacts} onEdit={setEditing} />
      {closed.length > 0 && <StoreTable title={`ปิดแล้ว (${closed.length})`} list={closed} contacts={contacts} onEdit={setEditing} muted />}
    </div>
  );
}

function StoreTable({ title, list, contacts, onEdit, muted }: { title: string; list: DeliveryStore[]; contacts: ContactLite[]; onEdit: (s: DeliveryStore) => void; muted?: boolean }) {
  return (
    <div className={`card overflow-x-auto ${muted ? "opacity-70" : ""}`}>
      <div className="px-4 pt-3 font-display font-bold">{title}</div>
      <table className="tbl mt-2">
        <thead><tr><th className="w-10">ลำดับ</th><th>ห้าง / สาขา</th><th>ชื่อย่อ</th><th>กลุ่ม</th><th>ลูกค้าในสมุดรายชื่อ</th><th className="w-16">สี</th><th className="w-28" /></tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id} className={muted ? "bg-cream/40" : ""}>
            <td className="text-ink-soft">{s.sort_order}</td>
            <td className="font-medium">{s.name}{!s.is_active && s.closed_at && <span className="ml-2 text-[11px] text-ink-soft">ปิด {s.closed_at}</span>}</td>
            <td>{s.short_name ?? "—"}</td><td>{s.group_name ?? "—"}</td>
            <td className="text-xs text-ink-soft">{contacts.find((c) => c.id === s.contact_id)?.name ?? "—"}</td>
            <td><span className="inline-block h-5 w-5 rounded-full" style={{ background: s.color }} /></td>
            <td><div className="flex gap-1 justify-end">
              <button type="button" onClick={() => onEdit(s)} className="btn-outline py-1 px-2 text-xs"><Pencil size={12} /></button>
              <form action={deleteDeliveryStore.bind(null, s.id)} onSubmit={(e) => { if (!confirm(`ลบ/ปิดห้าง ${s.name}?`)) e.preventDefault(); }}><button className="btn-outline py-1 px-2 text-xs !border-red !text-red"><Trash2 size={12} /></button></form>
            </div></td>
          </tr>))}
          {!list.length && <tr><td colSpan={7} className="text-center text-ink-soft py-6">ยังไม่มี</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StoreForm({ store, contacts, onClose }: { store: DeliveryStore | null; contacts: ContactLite[]; onClose: () => void }) {
  const [color, setColor] = useState(store?.color ?? COLORS[0]);
  const [contact, setContact] = useState<ContactLite | null>(contacts.find((c) => c.id === store?.contact_id) ?? null);
  const [q, setQ] = useState("");
  const res = useMemo(() => { const s = q.trim().toLowerCase(); return s ? contacts.filter((c) => c.name.toLowerCase().includes(s) || (c.code ?? "").toLowerCase().includes(s)).slice(0, 8) : []; }, [q, contacts]);
  return (
    <form action={saveDeliveryStore.bind(null, store?.id ?? null)} className="card p-5 space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-display font-bold">{store ? `แก้ไข ${store.name}` : "เพิ่มห้างใหม่"}</h2><button type="button" onClick={onClose} className="text-ink-soft"><X size={18} /></button></div>
      <input type="hidden" name="color" value={color} /><input type="hidden" name="contact_id" value={contact?.id ?? ""} />
      <div className="grid sm:grid-cols-3 gap-4">
        <div><label className="label">ชื่อห้าง / สาขา</label><input name="name" defaultValue={store?.name ?? ""} className="input" required placeholder="เช่น CENTRAL CHIDLOM" /></div>
        <div><label className="label">ชื่อย่อ (แสดงในตาราง)</label><input name="short_name" defaultValue={store?.short_name ?? ""} className="input" placeholder="เช่น CTR CHIDLOM" /></div>
        <div><label className="label">กลุ่ม</label><input name="group_name" defaultValue={store?.group_name ?? ""} className="input" list="store-groups" placeholder="Central / Hug Craft / Big C" /><datalist id="store-groups">{["Central", "Robinson", "Hug Craft", "Paragon", "The Mall", "Big C", "ICONSIAM", "อื่น ๆ"].map((g) => <option key={g} value={g} />)}</datalist></div>
        <div className="relative"><label className="label">ลูกค้าในสมุดรายชื่อ (ใช้ออกใบส่งของ)</label>
          {contact ? <div className="flex items-center gap-2 text-sm py-2"><span>{contact.name}</span><button type="button" onClick={() => setContact(null)} className="text-xs text-red">เอาออก</button></div>
            : <div className="relative"><Search size={14} className="absolute left-3 top-3 text-ink-soft" /><input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-8" placeholder="ค้นหาลูกค้า" />
              {res.length > 0 && <div className="absolute z-10 left-0 right-0 mt-1 card p-1 max-h-48 overflow-auto">{res.map((c) => <button key={c.id} type="button" onClick={() => { setContact(c); setQ(""); }} className="block w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-cream">{c.name}<span className="text-[11px] text-ink-soft ml-2">{c.code}</span></button>)}</div>}</div>}
        </div>
        <div><label className="label">ลำดับในตาราง</label><input type="number" name="sort_order" defaultValue={store?.sort_order ?? 100} className="input" /></div>
        <div><label className="label">สี</label><div className="flex flex-wrap gap-1.5 pt-1">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />)}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9" /></div></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" value="on" defaultChecked={store?.is_active ?? true} /> เปิดใช้งาน (ไม่ติ๊ก = ปิดห้าง ไม่แสดงในตาราง)</label>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-outline">ยกเลิก</button><button className="btn-primary">บันทึก</button></div>
    </form>
  );
}
