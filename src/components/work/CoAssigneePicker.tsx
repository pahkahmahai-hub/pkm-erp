"use client";

import { useState } from "react";
import { UsersRound } from "lucide-react";

/** เลือกผู้ร่วมงาน (หลายคน) — ส่งเป็น name="co_assignee" หลายค่า + co_assignee_set=1 (บอกว่าฟอร์มนี้มีช่องนี้) */
export function CoAssigneePicker({ options, defaultIds = [], primaryId }: { options: { id: string; name: string }[]; defaultIds?: string[]; primaryId?: string | null }) {
  const [sel, setSel] = useState<string[]>(defaultIds);
  const list = options.filter((o) => o.id !== primaryId);
  if (!list.length) return null;
  return (
    <div>
      <label className="label flex items-center gap-1"><UsersRound size={13} /> ผู้ร่วมงาน <span className="font-normal text-ink-soft">(เลือกได้หลายคน — งาน project ข้ามทีม)</span></label>
      <input type="hidden" name="co_assignee_set" value="1" />
      <div className="flex flex-wrap gap-1.5">
        {list.map((o) => {
          const on = sel.includes(o.id);
          return (
            <label key={o.id} className={`cursor-pointer rounded-full px-3 py-1 text-xs border select-none ${on ? "bg-purple text-white border-purple" : "border-line hover:bg-cream"}`}>
              <input type="checkbox" name="co_assignee" value={o.id} checked={on} onChange={() => setSel(on ? sel.filter((x) => x !== o.id) : [...sel, o.id])} className="hidden" />
              {on ? "✓ " : "+ "}{o.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}
