"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactKind } from "@/lib/stock/types";

type Lite = Pick<Contact, "id" | "name" | "code" | "tax_id">;

/** Search + pick a contact, or add a new one inline. Emits the chosen id through a hidden input. */
export function ContactPicker({ kind, contacts, name = "contact_id", initial, label }: { kind: ContactKind; contacts: Lite[]; name?: string; initial?: Lite | null; label: string }) {
  const [list, setList] = useState<Lite[]>(contacts);
  const [selected, setSelected] = useState<Lite | null>(initial ?? null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return list.filter((c) => c.name.toLowerCase().includes(s) || (c.code ?? "").toLowerCase().includes(s) || (c.tax_id ?? "").includes(s)).slice(0, 8);
  }, [q, list]);

  async function addNew() {
    if (!newName.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("contacts").insert({ kind, name: newName.trim() }).select("id, name, code, tax_id").single();
    setBusy(false);
    if (error) return alert(error.message);
    setList([data, ...list]);
    setSelected(data);
    setAdding(false);
    setNewName("");
  }

  return (
    <div>
      <label className="label">{label}</label>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-purple bg-lavender/20 px-3 py-2.5 text-sm">
          <span className="font-medium">{selected.name}</span>
          <button type="button" onClick={() => setSelected(null)} className="text-xs text-purple">เปลี่ยน</button>
        </div>
      ) : adding ? (
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input" placeholder={`ชื่อ${kind === "supplier" ? "ซัพพลายเออร์" : "ลูกค้า"}ใหม่`} autoFocus />
          <button type="button" onClick={addNew} disabled={busy} className="btn-primary whitespace-nowrap">บันทึก</button>
          <button type="button" onClick={() => setAdding(false)} className="btn-ghost">ยกเลิก</button>
        </div>
      ) : (
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="ค้นหาชื่อ / รหัส / เลขผู้เสียภาษี" />
          {(results.length > 0 || q.trim()) && (
            <ul className="absolute z-20 mt-1 w-full card divide-y divide-line max-h-64 overflow-auto">
              {results.map((c) => (
                <li key={c.id}><button type="button" onClick={() => { setSelected(c); setQ(""); }} className="w-full text-left px-3 py-2 hover:bg-cream text-sm">{c.name}{c.code && <span className="text-xs text-ink-soft ml-2">{c.code}</span>}</button></li>
              ))}
              <li><button type="button" onClick={() => { setAdding(true); setNewName(q); setQ(""); }} className="w-full text-left px-3 py-2 text-sm text-purple font-semibold hover:bg-cream">+ เพิ่ม "{q}" เป็นรายชื่อใหม่</button></li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
