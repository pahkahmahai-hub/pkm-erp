import Link from "next/link";
import { FileDown, Plus, Trash2, Check, Undo2, SkipForward, ExternalLink } from "lucide-react";
import { DateInput } from "@/components/DateInput";
import { CorpItemImages } from "./CorpItemImages";
import { addCorpItem, updateCorpItem, deleteCorpItem, assignCorpStep, setCorpStepStatus, addCorpStep } from "@/app/(app)/work/actions";
import { DESIGN_TYPE_TH, LOGO_METHODS, logoMethodTH, type CorpItem, type CorpStep, type CorpImage } from "@/lib/work/corpSpec";

type Person = { id: string; name: string };
const dm = (d: string | null) => (d ? `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}` : "");

/** ใบงานสั่งสินค้า: รายการสินค้า · สเปก · รูป · ขั้นตอน + มอบหมาย */
export function CorpSpecSection({ orderId, roomId, items, steps, images, people, canCorp, canManage, meId, myEmp, today, rev }: {
  orderId: string; roomId: string; items: CorpItem[]; steps: CorpStep[]; images: CorpImage[]; people: Person[];
  canCorp: boolean; canManage: boolean; meId: string; myEmp: string | null; today: string; rev: number;
}) {
  const nameOf = (s: CorpStep) => (s.assignee_user_id ? people.find((p) => p.id === `u:${s.assignee_user_id}`)?.name : s.assignee_id ? people.find((p) => p.id === s.assignee_id)?.name : null) ?? null;
  const pdf = (v: string) => `/print/corp-spec/${orderId}?v=${v}`;
  return (
    <div id="spec" className="card p-5 space-y-4 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-bold flex-1">ใบงานสั่งสินค้า <span className="text-xs font-normal text-ink-soft">Order Specification Sheet · Rev.{String(rev).padStart(2, "0")}</span></h3>
        <a href={pdf("customer")} target="_blank" className="btn-outline text-xs py-1.5"><FileDown size={13} /> PDF ลูกค้า</a>
        <a href={pdf("supplier")} target="_blank" className="btn-outline text-xs py-1.5"><FileDown size={13} /> PDF ผู้ผลิต</a>
        <a href={pdf("internal")} target="_blank" className="btn-outline text-xs py-1.5"><FileDown size={13} /> PDF ภายใน</a>
      </div>

      {items.map((it) => {
        const st = steps.filter((s) => s.item_id === it.id).sort((a, b) => a.sort - b.sort);
        const done = st.filter((s) => s.status !== "todo").length;
        return (
          <div key={it.id} className="rounded-2xl border border-line p-4 space-y-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-lg">{it.line_code && <span className="text-purple mr-1.5">{it.line_code}</span>}{it.name}</div>
                <div className="text-xs text-ink-soft">{DESIGN_TYPE_TH[it.design_type]}{it.qty ? ` · ${it.qty.toLocaleString()} ${it.unit}` : ""}{it.base_model ? ` · แบบ: ${it.base_model}` : ""} · ขั้นตอน {done}/{st.length}</div>
              </div>
              {canManage && <form action={deleteCorpItem.bind(null, it.id, orderId)}><button className="text-ink-soft hover:text-red text-xs flex items-center gap-1" title="ลบรายการนี้"><Trash2 size={13} /> ลบรายการ</button></form>}
            </div>

            {/* สเปก */}
            <dl className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              {([["ขนาด", it.size], ["วัสดุ", it.material], ["สี / เทคนิคผลิต", it.color_process], ["Pantone", it.pantone], ["รูปแบบผลิต LOGO", it.logo_method ? logoMethodTH(it.logo_method) : null], ["ตำแหน่ง LOGO", it.logo_position], ["ตำแหน่งติด Tag", it.tag_position], ["แพคเกจจิ้ง", it.packaging], ["ผู้ผลิต", it.supplier_name], ["ส่งตัวอย่าง", it.sample_required ? "ลูกค้าต้องการตัวอย่าง" : null]] as [string, string | null][]).map(([l, v]) => (
                <div key={l}><dt className="text-[11px] text-ink-soft">{l}</dt><dd className={v ? "whitespace-pre-wrap" : "text-ink-soft/50"}>{v ?? "—"}</dd></div>
              ))}
              {it.remarks && <div className="sm:col-span-2 md:col-span-3"><dt className="text-[11px] text-ink-soft">หมายเหตุ</dt><dd className="whitespace-pre-wrap">{it.remarks}</dd></div>}
            </dl>
            {canCorp && (
              <details className="rounded-xl bg-cream/60 px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-purple">✏️ แก้ไขสเปกรายการนี้</summary>
                <form action={updateCorpItem.bind(null, it.id, orderId)} className="mt-3"><ItemFields it={it} /><button className="btn-primary mt-3">บันทึกสเปก</button></form>
              </details>
            )}

            {/* รูป */}
            <div>
              <div className="text-sm font-semibold mb-1.5">รูป / อาร์ตเวิร์ก</div>
              <CorpItemImages itemId={it.id} orderId={orderId} roomId={roomId} images={images.filter((i) => i.item_id === it.id)} canCorp={canCorp} canManage={canManage} meId={meId} />
            </div>

            {/* ขั้นตอน */}
            <div>
              <div className="text-sm font-semibold mb-1.5">ขั้นตอน · ผู้รับผิดชอบ · กำหนด</div>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {st.map((s) => {
                  const mine = (!!myEmp && s.assignee_id === myEmp) || s.assignee_user_id === meId;
                  const can = canCorp || mine;
                  const od = s.status === "todo" && !!s.due_date && s.due_date < today;
                  return (
                    <li key={s.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${s.status !== "todo" ? "bg-green/5" : ""}`}>
                      <span className={`h-5 w-5 rounded-full grid place-items-center text-[11px] shrink-0 ${s.status === "done" ? "bg-green text-white" : s.status === "skipped" ? "bg-line text-ink-soft" : "border border-line"}`}>{s.status === "done" ? "✓" : s.status === "skipped" ? "–" : ""}</span>
                      <span className={`flex-1 min-w-[180px] ${s.status === "skipped" ? "line-through text-ink-soft" : ""}`}>{s.label}{s.optional && <span className="ml-1 text-[10px] text-ink-soft">(ถ้ามี)</span>}{mine && <span className="ml-1 text-[10px] text-purple font-semibold">(ของฉัน)</span>}</span>
                      {can ? (
                        <form action={assignCorpStep.bind(null, s.id, orderId)} className="flex items-center gap-1.5">
                          <select name="assignee" defaultValue={s.assignee_user_id ? `u:${s.assignee_user_id}` : s.assignee_id ?? ""} className="input !py-1 !text-xs w-36"><option value="">— ผู้รับผิดชอบ —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                          <DateInput name="due_date" defaultValue={s.due_date ?? ""} className="input !py-1 !text-xs w-[118px]" />
                          <button className="btn-outline !py-1 !px-2 text-xs">บันทึก</button>
                        </form>
                      ) : <span className="text-xs text-ink-soft">{nameOf(s) ?? "—"}{s.due_date ? ` · ${dm(s.due_date)}` : ""}</span>}
                      {od && <span className="text-[11px] text-red font-semibold">เลยกำหนด</span>}
                      {s.task_id && <Link href={`/work/tasks/${s.task_id}`} className="text-[11px] text-purple underline flex items-center gap-0.5" title="เปิดงานใน WORK"><ExternalLink size={11} /> งาน</Link>}
                      {can && (s.status === "todo" ? (<>
                        <form action={setCorpStepStatus.bind(null, s.id, orderId, "done")}><button className="rounded-lg bg-green/15 text-green px-2 py-1 text-xs font-semibold flex items-center gap-1"><Check size={12} /> เสร็จ</button></form>
                        {s.optional && <form action={setCorpStepStatus.bind(null, s.id, orderId, "skipped")}><button className="text-ink-soft text-xs flex items-center gap-0.5" title="ข้ามขั้นนี้"><SkipForward size={12} /> ข้าม</button></form>}
                      </>) : <form action={setCorpStepStatus.bind(null, s.id, orderId, "todo")}><button className="text-ink-soft text-xs flex items-center gap-0.5" title="ย้อนกลับเป็นยังไม่เสร็จ"><Undo2 size={12} /> ย้อน</button></form>)}
                    </li>
                  );
                })}
              </ul>
              {canCorp && <form action={addCorpStep.bind(null, it.id, orderId)} className="flex gap-2 mt-2"><input name="label" className="input !py-1.5 text-sm" placeholder="+ เพิ่มขั้นตอนพิเศษ เช่น ขออนุมัติสีจากแบรนด์" /><button className="btn-outline !py-1.5 text-xs">เพิ่ม</button></form>}
              <p className="text-[11px] text-ink-soft mt-1">มอบหมายพนักงาน = สร้างงานใน WORK ให้อัตโนมัติ (ขึ้นบอร์ด/แจ้งเตือน/นับผลงาน) · ส่งงานใน WORK = ขั้นตอนเสร็จ · ลูกค้าคอนเฟิร์มรูป = ติ๊ก “ลูกค้าคอนเฟิร์ม…” ให้เอง</p>
            </div>
          </div>
        );
      })}

      {canCorp && (
        <details className="rounded-2xl border-2 border-dashed border-line p-4" open={!items.length}>
          <summary className="cursor-pointer font-semibold text-purple flex items-center gap-1.5"><Plus size={16} /> เพิ่มรายการสินค้าในออเดอร์</summary>
          <form action={addCorpItem.bind(null, orderId)} className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="design_type" value="existing" defaultChecked className="accent-purple" /> แบบที่มีอยู่แล้ว <span className="text-ink-soft text-xs">(เลือกแบบ → ใส่โลโก้)</span></label>
              <label className="flex items-center gap-2"><input type="radio" name="design_type" value="new" className="accent-purple" /> แบบใหม่ <span className="text-ink-soft text-xs">(ออกแบบสินค้าให้ลูกค้า)</span></label>
            </div>
            <ItemFields />
            <button className="btn-primary">เพิ่มรายการ + สร้างขั้นตอนมาตรฐาน</button>
          </form>
        </details>
      )}
    </div>
  );
}

function ItemFields({ it }: { it?: CorpItem }) {
  return (
    <div className="grid md:grid-cols-3 gap-3 text-sm">
      <div><label className="label">รหัส / แบบ</label><input name="line_code" defaultValue={it?.line_code ?? ""} className="input" placeholder="เช่น A.1" /></div>
      <div className="md:col-span-2"><label className="label">ชื่อสินค้า / งาน *</label><input name="name" required defaultValue={it?.name ?? ""} className="input" placeholder="เช่น ตุ๊กตาพวงกุญแจมาสคอต + ถุงผ้าพับเก็บ" /></div>
      <div><label className="label">แบบสินค้าที่มี (รุ่น/SKU)</label><input name="base_model" defaultValue={it?.base_model ?? ""} className="input" /></div>
      <div><label className="label">จำนวน</label><input name="qty" type="number" min={0} defaultValue={it?.qty ?? ""} className="input" /></div>
      <div><label className="label">หน่วย</label><input name="unit" defaultValue={it?.unit ?? "ชิ้น"} className="input" /></div>
      <div><label className="label">ขนาด</label><input name="size" defaultValue={it?.size ?? ""} className="input" placeholder="ตุ๊กตา 4 นิ้ว / ถุงผ้า 13x16 นิ้ว" /></div>
      <div><label className="label">วัสดุ</label><input name="material" defaultValue={it?.material ?? ""} className="input" /></div>
      <div><label className="label">สี / เทคนิคการผลิต</label><input name="color_process" defaultValue={it?.color_process ?? ""} className="input" /></div>
      <div><label className="label">สี Pantone</label><input name="pantone" defaultValue={it?.pantone ?? ""} className="input" /></div>
      <div><label className="label">รูปแบบผลิต LOGO</label><select name="logo_method" defaultValue={it?.logo_method ?? ""} className="input"><option value="">—</option>{LOGO_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
      <div><label className="label">ตำแหน่ง LOGO</label><input name="logo_position" defaultValue={it?.logo_position ?? ""} className="input" /></div>
      <div><label className="label">ตำแหน่งติด Tag</label><input name="tag_position" defaultValue={it?.tag_position ?? ""} className="input" placeholder="เช่น เย็บติดตะเข็บข้างถุง (ด้านขวา)" /></div>
      <div className="md:col-span-2"><label className="label">แพคเกจจิ้ง</label><input name="packaging" defaultValue={it?.packaging ?? ""} className="input" placeholder="กล่องคราฟ / ถุงซิป / การ์ดข้อความ" /></div>
      <div><label className="label">ผู้ผลิต <span className="font-normal text-ink-soft">(ไม่แสดงในฉบับลูกค้า)</span></label><input name="supplier_name" defaultValue={it?.supplier_name ?? ""} className="input" /></div>
      <div className="md:col-span-3"><label className="label">หมายเหตุ / สเปกเพิ่มเติม</label><textarea name="remarks" defaultValue={it?.remarks ?? ""} rows={2} className="input" /></div>
      <label className="flex items-center gap-2"><input type="checkbox" name="sample_required" defaultChecked={it?.sample_required ?? false} /> ลูกค้าต้องการตัวอย่าง</label>
    </div>
  );
}
