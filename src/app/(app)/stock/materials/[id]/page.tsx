import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { saveMaterial, moveMaterial, writeOffMaterial, uploadImage, deleteMaterial } from "../../actions";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { ContactPicker } from "@/components/stock/ContactPicker";
import { ImageUploader } from "@/components/stock/ImageUploader";
import { MATERIAL_TH, type Material, type MaterialMovement } from "@/lib/stock/types";

export const dynamic = "force-dynamic";
const TYPE_TH: Record<string, string> = { opening: "ยอดเริ่มต้น", receive: "รับเข้า", in: "รับเข้า", issue: "เบิกออก", adjust: "ปรับยอด", writeoff: "ตัดทิ้ง (เสื่อม/ใช้ไม่ได้)" };

export default async function MaterialDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: m }, { data: moves }, { data: suppliers }] = await Promise.all([
    supabase.from("materials").select("*").eq("id", id).maybeSingle(),
    supabase.from("material_movements").select("*, app_users(display_name)").eq("material_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("contacts").select("id, name, code, tax_id").eq("kind", "supplier").eq("is_active", true).order("name"),
  ]);
  if (!m) notFound();
  const mat = m as Material;

  return (
    <div className="space-y-6">
      <Header title={mat.name} sub={`${MATERIAL_TH[mat.kind].name} · ${mat.code ?? "ไม่มีรหัส"}`} action={<a href={`/stock/materials?kind=${mat.kind}`} className="btn-ghost">กลับ</a>} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-4">
          <div className="card p-4">
            <ImageUploader action={uploadImage.bind(null, "materials", id)} current={mat.image_url} />
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-soft font-semibold">คงเหลือ</div>
            <div className={`font-display text-4xl font-bold ${Number(mat.qty) === 0 ? "text-red" : ""}`}>{Number(mat.qty).toLocaleString()} <span className="text-base font-normal text-ink-soft">{mat.unit}</span></div>
          </div>
        </div>

        <div className="space-y-6">
          <form action={moveMaterial.bind(null, id)} className="card p-6 space-y-4">
            <h2 className="font-display font-bold">รับเข้า / เบิกออก</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div><label className="label">รายการ</label>
                <select name="type" className="input"><option value="receive">รับเข้า</option><option value="issue">เบิกออก</option><option value="writeoff">ตัดทิ้ง (เสื่อม/ชำรุด/ใช้ไม่ได้)</option></select></div>
              <div><label className="label">จำนวน ({mat.unit})</label><input name="qty" type="number" step="0.01" min="0.01" className="input" required /></div>
              <ContactPicker kind="supplier" contacts={suppliers ?? []} label="ซัพพลายเออร์ (กรณีรับเข้า)" />
              <div className="md:col-span-3"><label className="label">หมายเหตุ / เบิกไปทำอะไร / เหตุผลที่ตัดทิ้ง</label><input name="note" className="input" /></div>
            </div>
            <button className="btn-primary">บันทึก</button>
          </form>

          {Number(mat.qty) > 0 && (
            <form action={writeOffMaterial.bind(null, id)} className="card p-6 space-y-3 border-red/30">
              <h2 className="font-display font-bold">ตัดทิ้งทั้งหมด</h2>
              <p className="text-sm text-ink-soft">ของเสื่อม ชำรุด หรือเลิกใช้ — ตัดยอดคงเหลือ <b>{Number(mat.qty).toLocaleString()} {mat.unit}</b> ออกจากสต็อกทันที ไม่ต้องทำใบเบิก (ประวัติยังเก็บไว้)</p>
              <input name="reason" className="input" placeholder="เหตุผล เช่น ใช้ออกบูธหลายรอบ ชำรุด" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hide" className="accent-purple" defaultChecked={mat.kind === "display"} /> ซ่อนรายการนี้จากคลังด้วย (เลิกใช้แล้ว)</label>
              <button className="btn-danger">ตัดทิ้ง {Number(mat.qty).toLocaleString()} {mat.unit}</button>
            </form>
          )}

          <form action={saveMaterial.bind(null, id)} className="card p-6 space-y-4">
            <h2 className="font-display font-bold">ข้อมูล</h2>
            <input type="hidden" name="kind" value={mat.kind} />
            <div className="grid md:grid-cols-4 gap-4">
              <div><label className="label">รหัส</label><input name="code" defaultValue={mat.code ?? ""} className="input" /></div>
              <div className="md:col-span-2"><label className="label">ชื่อ</label><input name="name" defaultValue={mat.name} className="input" required /></div>
              <div><label className="label">หน่วย</label><input name="unit" defaultValue={mat.unit} className="input" /></div>
              <div><label className="label">ขั้นต่ำ</label><input name="min_alert" type="number" step="0.01" defaultValue={mat.min_alert} className="input" /></div>
              {session.isAdmin && <div><label className="label">ต้นทุน/หน่วย (บาท)</label><input name="unit_cost" type="number" step="0.01" defaultValue={mat.unit_cost ?? 0} className="input" /></div>}
              <div className="md:col-span-3"><label className="label">หมายเหตุ</label><input name="note" defaultValue={mat.note ?? ""} className="input" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary">บันทึก</button>
              <span className="ml-auto"><ConfirmDelete action={deleteMaterial.bind(null, id)} label="ลบรายการ" warning="ลบรายการนี้พร้อมประวัติรับเข้า/เบิกทั้งหมด กู้คืนไม่ได้" /></span>
            </div>
          </form>

          <section className="card overflow-x-auto">
            <div className="px-5 pt-4 font-display font-bold">ประวัติ</div>
            <table className="tbl">
              <thead><tr><th>เวลา</th><th>รายการ</th><th className="text-right">จำนวน</th><th className="text-right">คงเหลือ</th><th>โดย</th><th>หมายเหตุ</th></tr></thead>
              <tbody>
                {((moves ?? []) as MaterialMovement[]).map((mv) => (
                  <tr key={mv.id}>
                    <td className="text-xs whitespace-nowrap">{fmtDateTime(mv.created_at)}</td>
                    <td><span className="badge-off">{TYPE_TH[mv.movement_type] ?? mv.movement_type}</span></td>
                    <td className={`text-right font-semibold ${Number(mv.qty) < 0 ? "text-red" : "text-green"}`}>{Number(mv.qty) > 0 ? "+" : ""}{Number(mv.qty).toLocaleString()}</td>
                    <td className="text-right">{Number(mv.balance_after).toLocaleString()}</td>
                    <td className="text-xs">{mv.app_users?.display_name ?? "ระบบ"}</td>
                    <td className="text-xs text-ink-soft">{mv.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
