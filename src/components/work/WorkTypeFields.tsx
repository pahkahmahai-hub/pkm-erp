"use client";

import { useState } from "react";
import { WORK_TYPES, unitOf } from "@/lib/work/workType";

/** ประเภทงาน + จำนวน (งานฝั่ง GC) */
export function WorkTypeFields({ defaultType, defaultQty }: { defaultType?: string | null; defaultQty?: number | null }) {
  const [type, setType] = useState(defaultType ?? "");
  const [qty, setQty] = useState<number>(defaultQty ?? 1);
  return (
    <>
      <div><label className="label">ประเภทงาน</label>
        <select name="work_type" value={type} onChange={(e) => setType(e.target.value)} className="input">
          <option value="">— ยังไม่ระบุ —</option>
          {WORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          {type && !(WORK_TYPES as readonly string[]).includes(type) && <option value={type}>{type}</option>}
        </select>
      </div>
      <div><label className="label">จำนวน {type && <span className="font-normal text-ink-soft">({unitOf(type)})</span>}</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="btn-outline h-11 w-11 p-0 text-lg">−</button>
          <input name="work_qty" type="number" min={1} value={type ? qty : ""} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} disabled={!type} className="input w-24 text-center text-lg font-semibold" />
          <button type="button" onClick={() => setQty((q) => q + 1)} disabled={!type} className="btn-outline h-11 w-11 p-0 text-lg">+</button>
          {type && <span className="text-sm text-ink-soft">{unitOf(type)}</span>}
        </div>
        <input type="hidden" name="work_type_set" value="1" />
      </div>
    </>
  );
}
